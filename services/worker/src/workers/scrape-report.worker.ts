/**
 * Scrape Report Worker
 *
 * Scrapes latest CQC report metadata for a facility.
 */

import { Worker, type Job } from 'bullmq';
import {
  QUEUE_NAMES,
  createWorkerConnection,
  type ScrapeReportJobData,
  type ScrapeReportJobResult,
} from '@regintel/queue';
import {
  scrapeLatestReport,
  buildCqcReportSummary,
  isWebsiteReportNewer,
} from '@regintel/domain/cqc-scraper';
import { fetchCqcLocation } from '@regintel/domain/cqc-client';
import { EvidenceType } from '@regintel/domain/evidence-types';
import {
  createStorageProvider,
  loadStorageConfigFromEnv,
} from '@regintel/storage';
import { config } from '../config';
import { workerStore } from '../integrations/database';

// Use shared storage provider from @regintel/storage
const blobStorage = createStorageProvider(loadStorageConfigFromEnv());

async function processScrapeReportJob(
  job: Job<ScrapeReportJobData>
): Promise<ScrapeReportJobResult> {
  const { cqcLocationId } = job.data;

  try {
    const apiResult = await fetchCqcLocation(cqcLocationId, {
      apiKey: process.env.CQC_API_KEY,
    });
    const apiData = apiResult.success ? apiResult.data : null;
    const apiReportDate = apiData?.currentRatings?.overall?.reportDate;

    const scrapeResult = await scrapeLatestReport(cqcLocationId);

    if (!scrapeResult.success) {
      return {
        success: false,
        hasReport: false,
        apiReportDate,
        error: scrapeResult.error.message,
      };
    }

    const { report } = scrapeResult;
    const websiteReportDate = report.reportDate || undefined;
    const { tenantId, actorId, facilityId, providerId } = job.data;
    const ctx = { tenantId, actorId };

    const facility = await workerStore.getFacilityById(ctx, facilityId);
    if (!facility) {
      return {
        success: false,
        hasReport: false,
        apiReportDate,
        error: 'Facility not found',
      };
    }

    // Handle never-inspected facilities
    if (!report.hasReport) {
      await workerStore.upsertFacility(ctx, {
        ...facility,
        inspectionStatus: 'NEVER_INSPECTED',
        lastReportScrapedAt: new Date().toISOString(),
      });

      return {
        success: true,
        hasReport: false,
        apiReportDate,
        websiteReportDate,
        reportDate: report.reportDate,
        reportUrl: report.reportUrl,
        pdfUrl: report.pdfUrl,
      };
    }

    const shouldDownloadReport =
      report.hasReport &&
      (isWebsiteReportNewer(websiteReportDate, apiReportDate) ||
        (!apiReportDate && Boolean(websiteReportDate)));

    const summary = buildCqcReportSummary(report, apiData);

    if (!shouldDownloadReport) {
      const skipReason = !websiteReportDate
        ? 'WEBSITE_DATE_UNAVAILABLE'
        : apiReportDate
          ? 'API_REPORT_UP_TO_DATE'
          : 'API_REPORT_DATE_MISSING';
      await workerStore.upsertFacility(ctx, {
        ...facility,
        latestRating: summary.rating || facility.latestRating,
        latestRatingDate: summary.reportDate || facility.latestRatingDate,
        inspectionStatus: report.hasReport ? 'INSPECTED' : 'NEVER_INSPECTED',
        lastReportScrapedAt: new Date().toISOString(),
        lastScrapedReportDate: report.reportDate,
        lastScrapedReportUrl: report.reportUrl,
      });

      return {
        success: true,
        hasReport: true,
        skipped: true,
        reason: skipReason,
        apiReportDate,
        websiteReportDate,
        rating: summary.rating,
        reportDate: summary.reportDate,
        reportUrl: report.reportUrl,
        pdfUrl: report.pdfUrl,
        summary,
      };
    }

    // Capture Evidence
    let evidenceRecordId: string | undefined;

    if (report.pdfUrl) {
      // In a real worker, we'd might use a separate service, but for now we'll match app.ts logic
      // Note: downloadPdfReport is in @regintel/domain/cqc-scraper
      const { downloadPdfReport } = await import('@regintel/domain/cqc-scraper');
      const pdfResult = await downloadPdfReport(report.pdfUrl);
      if (pdfResult.success) {
        const pdfBuffer = Buffer.from(pdfResult.contentBase64, 'base64');
        const blobMetadata = await blobStorage.upload(pdfBuffer, 'application/pdf');
        await workerStore.createEvidenceBlob(ctx, {
          contentHash: blobMetadata.contentHash,
          contentType: blobMetadata.contentType,
          sizeBytes: blobMetadata.sizeBytes,
          uploadedAt: blobMetadata.uploadedAt,
          storagePath: blobMetadata.storagePath,
        });

        const evidenceRecord = await workerStore.createEvidenceRecord(ctx, {
          facilityId,
          providerId,
          blobHash: blobMetadata.contentHash,
          evidenceType: EvidenceType.CQC_REPORT,
          fileName: `CQC-Report-${report.reportDate || 'latest'}.pdf`,
          description: `CQC inspection report (${summary.rating || report.rating})`,
          metadata: {
            cqcReportSummary: summary,
            apiReportDate,
            websiteReportDate,
          },
        });

        evidenceRecordId = evidenceRecord.id;
      }
    } else if (report.htmlContent) {
      // Fallback to HTML
      const htmlBuffer = Buffer.from(report.htmlContent, 'utf-8');
      const blobMetadata = await blobStorage.upload(htmlBuffer, 'text/html');
      await workerStore.createEvidenceBlob(ctx, {
        contentHash: blobMetadata.contentHash,
        contentType: blobMetadata.contentType,
        sizeBytes: blobMetadata.sizeBytes,
        uploadedAt: blobMetadata.uploadedAt,
        storagePath: blobMetadata.storagePath,
      });

      const evidenceRecord = await workerStore.createEvidenceRecord(ctx, {
        facilityId,
        providerId,
        blobHash: blobMetadata.contentHash,
        evidenceType: EvidenceType.CQC_REPORT,
        fileName: `CQC-Report-${report.reportDate || 'latest'}.html`,
        description: `CQC inspection report (HTML) - ${summary.rating || report.rating}`,
        metadata: {
          cqcReportSummary: summary,
          apiReportDate,
          websiteReportDate,
        },
      });

      evidenceRecordId = evidenceRecord.id;
    }

    // Update facility with scraped data
    await workerStore.upsertFacility(ctx, {
      ...facility,
      latestRating: summary.rating || report.rating || facility.latestRating,
      latestRatingDate: summary.reportDate || report.reportDate || facility.latestRatingDate,
      inspectionStatus: 'INSPECTED',
      lastReportScrapedAt: new Date().toISOString(),
      lastScrapedReportDate: report.reportDate,
      lastScrapedReportUrl: report.reportUrl,
    });

    await workerStore.appendAuditEvent(ctx, providerId, 'REPORT_SCRAPED', {
      facilityId,
      cqcLocationId,
      rating: report.rating,
      reportDate: report.reportDate,
      evidenceRecordId,
      hasReport: report.hasReport,
      summary,
    });

    return {
      success: true,
      hasReport: true,
      rating: summary.rating,
      reportDate: summary.reportDate,
      reportUrl: report.reportUrl,
      pdfUrl: report.pdfUrl,
      evidenceRecordId,
      apiReportDate,
      websiteReportDate,
      summary,
    };
  } catch (error) {
    return {
      success: false,
      hasReport: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create and start scrape report worker
 */
export function createScrapeReportWorker(): Worker<ScrapeReportJobData, ScrapeReportJobResult> {
  const connection = createWorkerConnection(QUEUE_NAMES.SCRAPE_REPORT);

  const worker = new Worker<ScrapeReportJobData, ScrapeReportJobResult>(
    QUEUE_NAMES.SCRAPE_REPORT,
    processScrapeReportJob,
    {
      connection,
      concurrency: config.worker.concurrency.scrapeReport,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[ScrapeReport] Job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[ScrapeReport] Job ${job?.id} failed:`, error.message);
  });

  return worker;
}
