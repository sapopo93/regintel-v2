/**
 * PDF Renderer — pdfkit-based binary PDF generation for all report types.
 *
 * Presentation concern only. Takes domain data structures, returns Buffer.
 */

import PDFDocument from 'pdfkit';
import type { RenderOutput } from './renderer-types.js';
import type { PdfExport } from '@regintel/domain';
import type { InspectorEvidencePack } from '@regintel/domain';
import type { BlueOceanReport } from '@regintel/domain';

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Strips tenant prefix from scoped keys for display.
 * "user_3AIES…:session-11" → "session-11"
 */
function displayId(scopedId: string): string {
  const colonIdx = scopedId.indexOf(':');
  return colonIdx >= 0 ? scopedId.slice(colonIdx + 1) : scopedId;
}

function collectBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function addWatermark(doc: PDFKit.PDFDocument, text: string): void {
  doc.save();
  doc.fontSize(10).fillColor('#999999');
  doc.text(text, 50, 20, { width: 500, align: 'center' });
  doc.restore();
}

function addMetadataFooter(
  doc: PDFKit.PDFDocument,
  meta: { topicCatalogVersion: string; topicCatalogHash: string; prsLogicVersion: string; prsLogicHash: string }
): void {
  const y = doc.page.height - 70;  // 70px from bottom keeps text above the margin boundary
  doc.save();
  doc.fontSize(7).fillColor('#aaaaaa');
  doc.text(
    `Topic Catalog: ${meta.topicCatalogVersion} (${meta.topicCatalogHash}) | PRS Logic: ${meta.prsLogicVersion} (${meta.prsLogicHash})`,
    50,
    y,
    { width: 500, align: 'center' }
  );
  doc.restore();
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return '#d32f2f';
    case 'HIGH': return '#e65100';
    case 'MEDIUM': return '#f9a825';
    case 'LOW': return '#2e7d32';
    default: return '#333333';
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

// ── Mock Findings PDF ───────────────────────────────────────────────

export async function renderFindingsPdf(pdfExport: PdfExport): Promise<RenderOutput> {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const bufferPromise = collectBuffer(doc);

  const meta = {
    topicCatalogVersion: pdfExport.metadata.topicCatalogVersion,
    topicCatalogHash: pdfExport.metadata.topicCatalogSha256,
    prsLogicVersion: pdfExport.metadata.prsLogicProfilesVersion,
    prsLogicHash: pdfExport.metadata.prsLogicProfilesSha256,
  };

  // Title page
  addWatermark(doc, pdfExport.watermark);
  doc.moveDown(6);
  doc.fontSize(24).fillColor('#1a237e').text('Mock Inspection Findings', { align: 'center' });
  doc.moveDown(1);
  const providerLabel = pdfExport.metadata.providerName ?? pdfExport.metadata.providerId;
  const facilityLabel = pdfExport.metadata.facilityName ? ` — ${pdfExport.metadata.facilityName}` : '';
  doc.fontSize(12).fillColor('#333333').text(`Provider: ${providerLabel}${facilityLabel}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.text(`Session: ${displayId(pdfExport.metadata.sessionId)}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.text(`Generated: ${formatDate(pdfExport.generatedAt)}`, { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(14).fillColor('#666666').text(`Total Findings: ${pdfExport.totalFindings}`, { align: 'center' });
  addMetadataFooter(doc, meta);

  // Findings pages
  for (const page of pdfExport.pages) {
    doc.addPage();
    addWatermark(doc, page.watermark);
    doc.moveDown(2);

    for (const finding of page.findings) {
      doc.fontSize(12).fillColor(severityColor(finding.severity))
        .text(`[${finding.severity}] ${finding.title}`, { continued: false });
      doc.moveDown(0.3);

      doc.fontSize(9).fillColor('#555555')
        .text(`Risk Score: ${finding.compositeRiskScore} | Regulation: ${finding.regulationId} § ${finding.regulationSectionId}`);
      doc.moveDown(0.2);

      doc.fontSize(9).fillColor('#333333').text(finding.description, { width: 490 });
      doc.moveDown(1);

      if (doc.y > doc.page.height - 100) break;
    }

    addMetadataFooter(doc, meta);
  }

  doc.end();
  return { buffer: await bufferPromise, mimeType: 'application/pdf', extension: 'pdf' };
}

// ── Inspector Evidence Pack PDF ─────────────────────────────────────

export async function renderInspectorPackPdf(pack: InspectorEvidencePack): Promise<RenderOutput> {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const bufferPromise = collectBuffer(doc);

  const meta = {
    topicCatalogVersion: pack.metadata.topicCatalogVersion,
    topicCatalogHash: pack.metadata.topicCatalogHash,
    prsLogicVersion: pack.metadata.prsLogicProfilesVersion,
    prsLogicHash: pack.metadata.prsLogicProfilesHash,
  };

  // Cover page
  if (pack.watermark) addWatermark(doc, pack.watermark);
  doc.moveDown(6);
  doc.fontSize(24).fillColor('#1a237e').text('Inspector Evidence Pack', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(14).fillColor('#333333').text(pack.facilityName, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(11).text(`Generated: ${formatDate(pack.generatedAt)}`, { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(16).fillColor('#1a237e').text(
    `Overall Coverage: ${pack.overallCoverage.covered}/${pack.overallCoverage.total} (${pack.overallCoverage.percentage}%)`,
    { align: 'center' }
  );
  addMetadataFooter(doc, meta);

  // Coverage summary table
  doc.addPage();
  if (pack.watermark) addWatermark(doc, pack.watermark);
  doc.moveDown(2);
  doc.fontSize(16).fillColor('#1a237e').text('Coverage Summary');
  doc.moveDown(1);

  const tableTop = doc.y;
  const colWidths = [200, 80, 80];
  const headers = ['Key Question', 'Covered', 'Percentage'];

  // Table header
  doc.fontSize(10).fillColor('#ffffff');
  doc.rect(50, tableTop, 360, 20).fill('#1a237e');
  let xPos = 55;
  for (let i = 0; i < headers.length; i++) {
    doc.fillColor('#ffffff').text(headers[i], xPos, tableTop + 5, { width: colWidths[i] });
    xPos += colWidths[i];
  }

  // Table rows
  let rowY = tableTop + 22;
  for (const section of pack.keyQuestionSections) {
    const bgColor = rowY % 2 === 0 ? '#f5f5f5' : '#ffffff';
    doc.rect(50, rowY, 360, 18).fill(bgColor);

    xPos = 55;
    doc.fontSize(9).fillColor('#333333');
    doc.text(section.label, xPos, rowY + 4, { width: colWidths[0] });
    xPos += colWidths[0];
    doc.text(`${section.coverageSummary.covered}/${section.coverageSummary.total}`, xPos, rowY + 4, { width: colWidths[1] });
    xPos += colWidths[1];
    doc.text(`${section.coverageSummary.percentage}%`, xPos, rowY + 4, { width: colWidths[2] });
    rowY += 18;
  }

  doc.y = rowY + 10;

  // Per-QS sections
  for (const section of pack.keyQuestionSections) {
    doc.addPage();
    if (pack.watermark) addWatermark(doc, pack.watermark);
    doc.moveDown(2);
    doc.fontSize(14).fillColor('#1a237e').text(section.label);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#555555')
      .text(`Coverage: ${section.coverageSummary.covered}/${section.coverageSummary.total} (${section.coverageSummary.percentage}%)`);
    doc.moveDown(1);

    for (const qs of section.qualityStatements) {
      if (doc.y > doc.page.height - 120) {
        doc.addPage();
        if (pack.watermark) addWatermark(doc, pack.watermark);
        doc.moveDown(2);
      }

      const statusLabel = qs.covered ? 'Covered' : (qs.awaitingAuditItems.length > 0 ? 'Partial' : 'Gap');
      const statusColor = qs.covered ? '#2e7d32' : (qs.awaitingAuditItems.length > 0 ? '#f9a825' : '#d32f2f');

      doc.fontSize(10).fillColor(statusColor).text(`${qs.id}: ${qs.title} — ${statusLabel}`);
      doc.moveDown(0.3);

      if (qs.evidenceItems.length > 0) {
        for (const item of qs.evidenceItems) {
          doc.fontSize(8).fillColor('#333333')
            .text(`  • ${item.fileName} (${item.evidenceType}) — ${item.mappingSource}`, { indent: 10 });
        }
      }

      if (qs.gaps.length > 0) {
        for (const gap of qs.gaps) {
          doc.fontSize(8).fillColor('#d32f2f').text(`  ⚠ ${gap}`, { indent: 10 });
        }
      }

      doc.moveDown(0.5);
    }
    addMetadataFooter(doc, meta);
  }

  // Outstanding Readiness Indicators
  doc.addPage();
  if (pack.watermark) addWatermark(doc, pack.watermark);
  doc.moveDown(2);
  doc.fontSize(14).fillColor('#1a237e').text('Outstanding Readiness Indicators');
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#555555')
    .text(`Overall indicator coverage: ${pack.outstandingReadiness.overallScore}%`);
  doc.moveDown(1);

  for (const indicator of pack.outstandingReadiness.indicators) {
    if (doc.y > doc.page.height - 100) {
      doc.addPage();
      if (pack.watermark) addWatermark(doc, pack.watermark);
      doc.moveDown(2);
    }

    const badge = indicator.hasEvidence ? 'Present' : 'Missing';
    const color = indicator.hasEvidence ? '#2e7d32' : '#999999';
    doc.fontSize(10).fillColor(color).text(`${indicator.label} — ${badge}`);
    doc.fontSize(8).fillColor('#555555').text(indicator.description);
    if (indicator.evidenceItems.length > 0) {
      for (const item of indicator.evidenceItems) {
        doc.text(`  • ${item.fileName} (${item.signalType})`, { indent: 10 });
      }
    }
    doc.moveDown(0.5);
  }
  addMetadataFooter(doc, meta);

  doc.end();
  return { buffer: await bufferPromise, mimeType: 'application/pdf', extension: 'pdf' };
}

// ── Blue Ocean Board PDF ────────────────────────────────────────────

export async function renderBlueOceanBoardPdf(report: BlueOceanReport): Promise<RenderOutput> {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const bufferPromise = collectBuffer(doc);

  const meta = {
    topicCatalogVersion: report.metadata.topicCatalogVersion,
    topicCatalogHash: report.metadata.topicCatalogHash,
    prsLogicVersion: report.metadata.prsLogicProfilesVersion,
    prsLogicHash: report.metadata.prsLogicProfilesHash,
  };

  // Cover
  if (report.watermark) addWatermark(doc, report.watermark);
  doc.moveDown(6);
  doc.fontSize(24).fillColor('#1a237e').text('Blue Ocean Report', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(14).fillColor('#555555').text('Board Pack', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(11).fillColor('#333333').text(`Domain: ${report.domain}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.text(`Reporting Domain: ${report.reportingDomain}`, { align: 'center' });
  addMetadataFooter(doc, meta);

  // Quality Gates
  doc.addPage();
  if (report.watermark) addWatermark(doc, report.watermark);
  doc.moveDown(2);
  doc.fontSize(16).fillColor('#1a237e').text('Quality Assurance Gates');
  doc.moveDown(1);

  const qg = report.sections.qualityGates;
  const gates = [
    ['RCA Coverage', qg.rcaCoverageScore],
    ['Mock Watermark', qg.mockWatermarkScore],
    ['Domain Consistency', qg.domainConsistencyScore],
    ['Determinism', qg.determinismScore],
    ['Overall', qg.overallScore],
  ] as const;
  for (const [label, score] of gates) {
    const color = score >= 95 ? '#2e7d32' : score >= 70 ? '#f9a825' : '#d32f2f';
    doc.fontSize(11).fillColor(color).text(`${label}: ${score}%`);
    doc.moveDown(0.3);
  }
  addMetadataFooter(doc, meta);

  // Executive Summary
  doc.addPage();
  if (report.watermark) addWatermark(doc, report.watermark);
  doc.moveDown(2);
  doc.fontSize(16).fillColor('#1a237e').text('Executive Summary');
  doc.moveDown(1);

  const es = report.sections.executiveSummary;
  doc.fontSize(11).fillColor('#333333');
  doc.text(`Total Findings: ${es.totalFindings}`);
  doc.text(`Major Findings: ${es.majorFindings}`);
  doc.text(`Top Severity: ${es.topSeverity ?? 'None'}`);
  doc.text(`Open Actions: ${es.openActions}`);
  doc.text(`Verified Actions: ${es.verifiedActions}`);
  addMetadataFooter(doc, meta);

  // Priority Findings
  if (report.sections.majorFindings.length > 0) {
    doc.addPage();
    if (report.watermark) addWatermark(doc, report.watermark);
    doc.moveDown(2);
    doc.fontSize(16).fillColor('#1a237e').text('Priority Findings');
    doc.moveDown(1);

    for (const finding of report.sections.majorFindings) {
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
        if (report.watermark) addWatermark(doc, report.watermark);
        doc.moveDown(2);
      }

      doc.fontSize(11).fillColor(severityColor(finding.severity))
        .text(`[${finding.severity}] ${finding.title}`);
      doc.fontSize(9).fillColor('#555555')
        .text(`Risk: ${finding.compositeRiskScore} | Regulation: ${finding.regulationId}`);
      doc.moveDown(0.8);
    }
    addMetadataFooter(doc, meta);
  }

  // Action Plan
  if (report.sections.remediationPlan.actionDetails.length > 0) {
    doc.addPage();
    if (report.watermark) addWatermark(doc, report.watermark);
    doc.moveDown(2);
    doc.fontSize(16).fillColor('#1a237e').text('Action Plan');
    doc.moveDown(1);

    const rp = report.sections.remediationPlan;
    doc.fontSize(10).fillColor('#333333');
    doc.text(`Open: ${rp.openActions} | In Progress: ${rp.inProgressActions} | Pending Verification: ${rp.pendingVerificationActions} | Verified: ${rp.verifiedActions}`);
    doc.moveDown(1);

    for (const action of rp.actionDetails) {
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
        if (report.watermark) addWatermark(doc, report.watermark);
        doc.moveDown(2);
      }

      doc.fontSize(10).fillColor('#333333').text(action.description);
      const details = [
        action.ownerRole ? `Owner: ${action.ownerRole}` : null,
        action.targetCompletionDate ? `Deadline: ${formatDate(action.targetCompletionDate)}` : null,
        `Status: ${action.status}`,
      ].filter(Boolean).join(' | ');
      doc.fontSize(8).fillColor('#555555').text(details);
      doc.moveDown(0.6);
    }
    addMetadataFooter(doc, meta);
  }

  // Risk Outlook
  doc.addPage();
  if (report.watermark) addWatermark(doc, report.watermark);
  doc.moveDown(2);
  doc.fontSize(16).fillColor('#1a237e').text('Risk Outlook');
  doc.moveDown(1);

  const ro = report.sections.riskOutlook;
  doc.fontSize(11).fillColor('#333333');
  doc.text(`Highest Composite Risk Score: ${ro.highestCompositeRiskScore}`);
  doc.text(`Average Composite Risk Score: ${ro.averageCompositeRiskScore}`);
  doc.text(`High Risk: ${ro.riskTierBreakdown.high} | Medium: ${ro.riskTierBreakdown.medium} | Low: ${ro.riskTierBreakdown.low}`);
  addMetadataFooter(doc, meta);

  doc.end();
  return { buffer: await bufferPromise, mimeType: 'application/pdf', extension: 'pdf' };
}

// ── Blue Ocean Audit PDF ────────────────────────────────────────────

export async function renderBlueOceanAuditPdf(report: BlueOceanReport): Promise<RenderOutput> {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const bufferPromise = collectBuffer(doc);

  const meta = {
    topicCatalogVersion: report.metadata.topicCatalogVersion,
    topicCatalogHash: report.metadata.topicCatalogHash,
    prsLogicVersion: report.metadata.prsLogicProfilesVersion,
    prsLogicHash: report.metadata.prsLogicProfilesHash,
  };

  // Cover
  if (report.watermark) addWatermark(doc, report.watermark);
  doc.moveDown(6);
  doc.fontSize(24).fillColor('#1a237e').text('Blue Ocean Report', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(14).fillColor('#555555').text('Audit Pack — Internal', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(11).fillColor('#333333').text(`Report ID: ${displayId(report.reportId)}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.text(`Domain: ${report.domain} | Reporting Domain: ${report.reportingDomain}`, { align: 'center' });
  addMetadataFooter(doc, meta);

  // Constitutional Metadata Block
  doc.addPage();
  if (report.watermark) addWatermark(doc, report.watermark);
  doc.moveDown(2);
  doc.fontSize(16).fillColor('#1a237e').text('Constitutional Metadata');
  doc.moveDown(1);
  doc.fontSize(10).fillColor('#333333');
  doc.text(`Topic Catalog: ${meta.topicCatalogVersion} (${meta.topicCatalogHash})`);
  doc.text(`PRS Logic Profiles: ${meta.prsLogicVersion} (${meta.prsLogicHash})`);
  if (report.metadata.snapshotTimestamp) {
    doc.text(`Snapshot: ${formatDate(report.metadata.snapshotTimestamp)}`);
  }
  addMetadataFooter(doc, meta);

  // Findings Overview
  doc.addPage();
  if (report.watermark) addWatermark(doc, report.watermark);
  doc.moveDown(2);
  doc.fontSize(16).fillColor('#1a237e').text('Findings Overview');
  doc.moveDown(1);

  const fo = report.sections.findingsOverview;
  doc.fontSize(11).fillColor('#333333');
  doc.text(`Total Findings: ${fo.totalFindings}`);
  doc.moveDown(0.5);

  const severities = Object.entries(fo.bySeverity) as [string, number][];
  for (const [sev, count] of severities) {
    doc.fontSize(10).fillColor(severityColor(sev)).text(`${sev}: ${count}`);
  }
  doc.moveDown(1);

  if (fo.topRegulations.length > 0) {
    doc.fontSize(12).fillColor('#1a237e').text('Top Regulations');
    doc.moveDown(0.3);
    for (const reg of fo.topRegulations) {
      doc.fontSize(9).fillColor('#333333').text(`${reg.regulationId}: ${reg.findingsCount} findings`);
    }
  }
  addMetadataFooter(doc, meta);

  // Evidence Index
  if (report.sections.evidenceIndex.length > 0) {
    doc.addPage();
    if (report.watermark) addWatermark(doc, report.watermark);
    doc.moveDown(2);
    doc.fontSize(16).fillColor('#1a237e').text('Evidence Index');
    doc.moveDown(1);

    for (const entry of report.sections.evidenceIndex) {
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
        if (report.watermark) addWatermark(doc, report.watermark);
        doc.moveDown(2);
      }
      doc.fontSize(10).fillColor('#333333')
        .text(`${entry.evidenceRef}: ${entry.title} (${entry.evidenceType})`);
      doc.fontSize(8).fillColor('#555555')
        .text(`Collected: ${formatDate(entry.collectedAt)} | Blob: ${entry.primaryBlobHash}`);
      doc.moveDown(0.4);
    }
    addMetadataFooter(doc, meta);
  }

  // Root Cause Analysis
  if (report.sections.rootCauseAnalysis.length > 0) {
    doc.addPage();
    if (report.watermark) addWatermark(doc, report.watermark);
    doc.moveDown(2);
    doc.fontSize(16).fillColor('#1a237e').text('Root Cause Analysis');
    doc.moveDown(1);

    for (const rca of report.sections.rootCauseAnalysis) {
      if (doc.y > doc.page.height - 120) {
        doc.addPage();
        if (report.watermark) addWatermark(doc, report.watermark);
        doc.moveDown(2);
      }

      doc.fontSize(11).fillColor('#333333').text(`Finding: ${rca.findingId}`);
      doc.moveDown(0.3);
      for (const hypothesis of rca.hypotheses) {
        doc.fontSize(9).fillColor('#555555').text(`Hypothesis: ${hypothesis.hypothesis}`);
        doc.fontSize(8).text(`  Confidence: ${hypothesis.confidence} | Disconfirming: ${hypothesis.disconfirmingTests.join(', ') || 'none'}`);
      }
      doc.moveDown(0.6);
    }
    addMetadataFooter(doc, meta);
  }

  // Remediation Plan
  doc.addPage();
  if (report.watermark) addWatermark(doc, report.watermark);
  doc.moveDown(2);
  doc.fontSize(16).fillColor('#1a237e').text('Remediation Plan');
  doc.moveDown(1);

  const rp = report.sections.remediationPlan;
  doc.fontSize(10).fillColor('#333333');
  doc.text(`Open: ${rp.openActions} | In Progress: ${rp.inProgressActions} | Verified: ${rp.verifiedActions} | Rejected: ${rp.rejectedActions}`);
  doc.moveDown(1);

  for (const action of rp.actionDetails) {
    if (doc.y > doc.page.height - 100) {
      doc.addPage();
      if (report.watermark) addWatermark(doc, report.watermark);
      doc.moveDown(2);
    }
    doc.fontSize(10).fillColor('#333333').text(action.description);
    const details = [
      `Finding: ${action.findingId}`,
      action.ownerRole ? `Owner: ${action.ownerRole}` : null,
      action.targetCompletionDate ? `Deadline: ${formatDate(action.targetCompletionDate)}` : null,
      `Status: ${action.status}`,
    ].filter(Boolean).join(' | ');
    doc.fontSize(8).fillColor('#555555').text(details);
    doc.moveDown(0.5);
  }
  addMetadataFooter(doc, meta);

  // Risk Outlook & Regulatory Mapping
  doc.addPage();
  if (report.watermark) addWatermark(doc, report.watermark);
  doc.moveDown(2);
  doc.fontSize(16).fillColor('#1a237e').text('Risk Outlook & Regulatory Mapping');
  doc.moveDown(1);

  const ro = report.sections.riskOutlook;
  doc.fontSize(11).fillColor('#333333');
  doc.text(`Highest Risk: ${ro.highestCompositeRiskScore} | Average: ${ro.averageCompositeRiskScore}`);
  doc.text(`Risk Tiers — High: ${ro.riskTierBreakdown.high}, Medium: ${ro.riskTierBreakdown.medium}, Low: ${ro.riskTierBreakdown.low}`);
  doc.moveDown(1);

  const rm = report.sections.regulatoryMapping;
  doc.fontSize(12).fillColor('#1a237e').text('Regulatory Mapping');
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#333333')
    .text(`Regulations Covered: ${rm.regulationsCovered}`);
  if (rm.regulationIds.length > 0) {
    doc.fontSize(9).fillColor('#555555').text(rm.regulationIds.join(', '));
  }
  addMetadataFooter(doc, meta);

  // Data Lineage
  doc.addPage();
  if (report.watermark) addWatermark(doc, report.watermark);
  doc.moveDown(2);
  doc.fontSize(16).fillColor('#1a237e').text('Data Lineage');
  doc.moveDown(1);

  const dl = report.sections.dataLineage;
  doc.fontSize(10).fillColor('#333333');
  doc.text(`Findings: ${dl.findingIds.length} | Actions: ${dl.actionIds.length} | Evidence: ${dl.evidenceIds.length}`);
  addMetadataFooter(doc, meta);

  doc.end();
  return { buffer: await bufferPromise, mimeType: 'application/pdf', extension: 'pdf' };
}
