export type RatingLabel =
  | 'Outstanding'
  | 'Good'
  | 'Requires improvement'
  | 'Inadequate'
  | 'Insufficient evidence'
  | 'Unknown';

export interface FacilityRecord {
  location_id: string;
  provider_id?: string;
  service_name: string;
  address: string;
  phone?: string;
  provider_name?: string;
  regulated_activities: string[];
  population_groups: string[];
  registration_status?: string;
  ratings: {
    overall?: RatingLabel;
    safe?: RatingLabel;
    effective?: RatingLabel;
    caring?: RatingLabel;
    responsive?: RatingLabel;
    well_led?: RatingLabel;
  };
}

export interface AssessmentEvent {
  assessment_id: string;
  assessment_date_start?: string;
  assessment_date_end?: string;
  publication_date?: string;
  ratings_snapshot: FacilityRecord['ratings'];
}

export interface HtmlBundleSection {
  domain: string;
  headings: string[];
  paragraphs: string[];
}

export interface HtmlBundleArtifact {
  location_id: string;
  assessment_id: string;
  source_url: string;
  retrieved_at: string;
  sections: HtmlBundleSection[];
  html_snapshots: Record<string, string>;
}

export interface PdfArtifact {
  type: 'full' | 'summary' | 'easy_read';
  download_url: string;
  sha256: string;
  num_pages: number;
  text_excerpt?: string;
}

export interface LocationTimelineEntry {
  assessment_id: string;
  publication_date?: string;
  assessment_date_start?: string;
  assessment_date_end?: string;
  html_urls: string[];
  pdf_urls: Array<{ type: PdfArtifact['type']; url: string }>;
}

export interface LocationTimelineResult {
  location_id: string;
  source_url: string;
  retrieved_at: string;
  entries: LocationTimelineEntry[];
}

export interface QualitySummary {
  parse_confidence: number;
  warnings: string[];
}

export interface ReconciledAssessmentEvent {
  facility: FacilityRecord;
  assessment_event: AssessmentEvent;
  artifacts: {
    html_bundle?: HtmlBundleArtifact;
    pdfs: PdfArtifact[];
  };
  quality: QualitySummary;
}

export interface HttpClient {
  getText(url: string): Promise<string>;
  getBuffer(url: string): Promise<Buffer>;
}

export interface FetchLike {
  (input: string, init?: RequestInit): Promise<Response>;
}
