import type { CqcInspectionReport } from './cqc-scraper.js';

export interface CqcReportSummary {
  rating?: string;
  reportDate?: string;
  publishedDate?: string;
  reportUrl?: string;
  hasReport: boolean;
}

export function buildCqcReportSummary(report: CqcInspectionReport): CqcReportSummary {
  return {
    rating: report.rating || undefined,
    reportDate: report.reportDate || undefined,
    publishedDate: report.publishedDate || undefined,
    reportUrl: report.reportUrl || undefined,
    hasReport: report.hasReport,
  };
}

export function isWebsiteReportNewer(apiReportDate?: string, websiteReportDate?: string): boolean {
  if (!websiteReportDate) return false;
  if (!apiReportDate) return true;
  const apiTs = Date.parse(apiReportDate);
  const webTs = Date.parse(websiteReportDate);
  if (Number.isNaN(apiTs) || Number.isNaN(webTs)) return false;
  return webTs > apiTs;
}
