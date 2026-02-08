import type {
  AssessmentEvent,
  FacilityRecord,
  HtmlBundleArtifact,
  LocationTimelineEntry,
  PdfArtifact,
  QualitySummary,
  ReconciledAssessmentEvent,
} from './types';

function buildQuality(
  timeline: LocationTimelineEntry,
  htmlBundle?: HtmlBundleArtifact,
  pdfs: PdfArtifact[] = []
): QualitySummary {
  const warnings: string[] = [];

  if (!timeline.publication_date) {
    warnings.push('publication_date missing from timeline');
  }
  if (!timeline.assessment_date_start) {
    warnings.push('assessment_date_start missing from timeline');
  }
  if (!htmlBundle) {
    warnings.push('html_bundle missing');
  } else if (htmlBundle.sections.length < 6) {
    warnings.push('html_bundle missing some domain sections');
  }
  if (pdfs.length === 0) {
    warnings.push('no pdf artifacts attached');
  }

  const parseConfidence = Math.max(0.5, 1 - warnings.length * 0.08);

  return { parse_confidence: parseConfidence, warnings };
}

export function reconcileAssessmentEvent(
  facility: FacilityRecord,
  timeline: LocationTimelineEntry,
  htmlBundle?: HtmlBundleArtifact,
  pdfs: PdfArtifact[] = []
): ReconciledAssessmentEvent {
  const assessmentEvent: AssessmentEvent = {
    assessment_id: timeline.assessment_id,
    assessment_date_start: timeline.assessment_date_start,
    assessment_date_end: timeline.assessment_date_end,
    publication_date: timeline.publication_date,
    ratings_snapshot: facility.ratings,
  };

  const quality = buildQuality(timeline, htmlBundle, pdfs);

  return {
    facility,
    assessment_event: assessmentEvent,
    artifacts: {
      html_bundle: htmlBundle,
      pdfs,
    },
    quality,
  };
}
