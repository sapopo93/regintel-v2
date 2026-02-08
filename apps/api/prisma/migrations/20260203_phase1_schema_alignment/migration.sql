-- Phase 1 schema alignment: add core entities, expand evidence/session/finding models,
-- and normalize tenant_id to TEXT for Clerk/org IDs.

-- New enum types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'facility_inspection_status') THEN
    CREATE TYPE facility_inspection_status AS ENUM (
      'NEVER_INSPECTED',
      'INSPECTED',
      'PENDING_FIRST_INSPECTION'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'facility_data_source') THEN
    CREATE TYPE facility_data_source AS ENUM ('CQC_API', 'MANUAL');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_mode') THEN
    CREATE TYPE report_mode AS ENUM ('REAL', 'MOCK');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'export_format') THEN
    CREATE TYPE export_format AS ENUM (
      'CSV',
      'PDF',
      'BLUE_OCEAN',
      'BLUE_OCEAN_BOARD',
      'BLUE_OCEAN_AUDIT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'background_job_type') THEN
    CREATE TYPE background_job_type AS ENUM (
      'SCRAPE_REPORT',
      'MALWARE_SCAN',
      'EVIDENCE_PROCESS',
      'AI_EVIDENCE_ANALYSIS',
      'AI_POLICY_GENERATION',
      'AI_MOCK_INSIGHT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'background_job_status') THEN
    CREATE TYPE background_job_status AS ENUM (
      'PENDING',
      'PROCESSING',
      'COMPLETED',
      'FAILED',
      'RETRYING'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evidence_scan_status') THEN
    CREATE TYPE evidence_scan_status AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'ERROR');
  END IF;
END $$;

-- Drop tenant isolation policies before altering columns (Fix for 0A000)
DROP POLICY IF EXISTS tenant_isolation_pcs ON provider_context_snapshots;
DROP POLICY IF EXISTS tenant_isolation_mis ON mock_inspection_sessions;
DROP POLICY IF EXISTS tenant_isolation_se ON session_events;
DROP POLICY IF EXISTS tenant_isolation_df ON draft_findings;
DROP POLICY IF EXISTS tenant_isolation_f ON findings;
DROP POLICY IF EXISTS tenant_isolation_er ON evidence_records;
DROP POLICY IF EXISTS tenant_isolation_ae ON audit_events;

-- Core tenant-scoped entities
CREATE TABLE IF NOT EXISTS providers (
  provider_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  org_ref TEXT,
  as_of TIMESTAMPTZ NOT NULL,
  prs_state provider_regulatory_state NOT NULL,
  registered_beds INT NOT NULL,
  service_types TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  CONSTRAINT providers_tenant_id_check CHECK (tenant_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_providers_tenant_id ON providers(tenant_id);

CREATE TABLE IF NOT EXISTS facilities (
  facility_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(provider_id),
  facility_name TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  town_city TEXT NOT NULL,
  postcode TEXT NOT NULL,
  address TEXT NOT NULL,
  cqc_location_id TEXT NOT NULL,
  service_type TEXT NOT NULL,
  capacity INT,
  facility_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  data_source facility_data_source NOT NULL,
  cqc_synced_at TIMESTAMPTZ,
  latest_rating TEXT,
  latest_rating_date TEXT,
  inspection_status facility_inspection_status NOT NULL,
  last_report_scraped_at TIMESTAMPTZ,
  last_scraped_report_date TEXT,
  last_scraped_report_url TEXT,
  CONSTRAINT facilities_tenant_id_check CHECK (tenant_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_facilities_tenant_id ON facilities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_facilities_provider_id ON facilities(provider_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_facilities_provider_cqc ON facilities(provider_id, cqc_location_id);

-- Drop foreign keys that depend on UUID types
ALTER TABLE mock_inspection_sessions DROP CONSTRAINT IF EXISTS mock_inspection_sessions_context_snapshot_id_fkey;
ALTER TABLE session_events DROP CONSTRAINT IF EXISTS session_events_session_id_fkey;
ALTER TABLE draft_findings DROP CONSTRAINT IF EXISTS draft_findings_session_id_fkey;
ALTER TABLE findings DROP CONSTRAINT IF EXISTS findings_context_snapshot_id_fkey;

-- Provider context snapshots
ALTER TABLE provider_context_snapshots
  ALTER COLUMN id TYPE TEXT USING id::text,
  ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;

ALTER TABLE provider_context_snapshots
  ADD COLUMN provider_id TEXT NOT NULL;

ALTER TABLE provider_context_snapshots
  ADD CONSTRAINT provider_context_snapshots_provider_id_fkey
  FOREIGN KEY (provider_id) REFERENCES providers(provider_id);

CREATE INDEX IF NOT EXISTS idx_pcs_provider_id ON provider_context_snapshots(provider_id);

-- Mock inspection sessions
ALTER TABLE mock_inspection_sessions
  ALTER COLUMN id TYPE TEXT USING id::text,
  ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text,
  ALTER COLUMN context_snapshot_id TYPE TEXT USING context_snapshot_id::text;

ALTER TABLE mock_inspection_sessions
  ADD COLUMN provider_id TEXT NOT NULL,
  ADD COLUMN facility_id TEXT NOT NULL,
  ADD COLUMN topic_id TEXT NOT NULL,
  ADD COLUMN mode report_mode NOT NULL DEFAULT 'MOCK',
  ADD COLUMN follow_ups_used INT NOT NULL DEFAULT 0,
  ADD COLUMN max_follow_ups INT NOT NULL DEFAULT 4,
  ADD COLUMN topic_catalog_version TEXT NOT NULL,
  ADD COLUMN topic_catalog_hash TEXT NOT NULL,
  ADD COLUMN prs_logic_profiles_version TEXT NOT NULL,
  ADD COLUMN prs_logic_profiles_hash TEXT NOT NULL;

ALTER TABLE mock_inspection_sessions
  ADD CONSTRAINT mock_inspection_sessions_context_snapshot_id_fkey
  FOREIGN KEY (context_snapshot_id) REFERENCES provider_context_snapshots(id);

ALTER TABLE mock_inspection_sessions
  ADD CONSTRAINT mock_inspection_sessions_provider_id_fkey
  FOREIGN KEY (provider_id) REFERENCES providers(provider_id);

ALTER TABLE mock_inspection_sessions
  ADD CONSTRAINT mock_inspection_sessions_facility_id_fkey
  FOREIGN KEY (facility_id) REFERENCES facilities(facility_id);

CREATE INDEX IF NOT EXISTS idx_mis_provider_id ON mock_inspection_sessions(provider_id);
CREATE INDEX IF NOT EXISTS idx_mis_facility_id ON mock_inspection_sessions(facility_id);

-- Session events
ALTER TABLE session_events
  ALTER COLUMN session_id TYPE TEXT USING session_id::text,
  ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;

ALTER TABLE session_events
  ADD CONSTRAINT session_events_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES mock_inspection_sessions(id) ON DELETE CASCADE;

-- Draft findings
ALTER TABLE draft_findings
  ALTER COLUMN session_id TYPE TEXT USING session_id::text,
  ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;

ALTER TABLE draft_findings
  ADD CONSTRAINT draft_findings_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES mock_inspection_sessions(id) ON DELETE CASCADE;

-- Findings
ALTER TABLE findings
  ALTER COLUMN id TYPE TEXT USING id::text,
  ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text,
  ALTER COLUMN context_snapshot_id TYPE TEXT USING context_snapshot_id::text;

ALTER TABLE findings
  ADD COLUMN provider_id TEXT NOT NULL,
  ADD COLUMN facility_id TEXT NOT NULL,
  ADD COLUMN session_id TEXT NOT NULL,
  ADD COLUMN topic_id TEXT NOT NULL,
  ADD COLUMN evidence_required TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN evidence_provided TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN evidence_missing TEXT[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE findings
  ADD CONSTRAINT findings_context_snapshot_id_fkey
  FOREIGN KEY (context_snapshot_id) REFERENCES provider_context_snapshots(id);

ALTER TABLE findings
  ADD CONSTRAINT findings_provider_id_fkey
  FOREIGN KEY (provider_id) REFERENCES providers(provider_id);

ALTER TABLE findings
  ADD CONSTRAINT findings_facility_id_fkey
  FOREIGN KEY (facility_id) REFERENCES facilities(facility_id);

CREATE INDEX IF NOT EXISTS idx_f_provider_id ON findings(provider_id);
CREATE INDEX IF NOT EXISTS idx_f_facility_id ON findings(facility_id);

-- Evidence records
ALTER TABLE evidence_records
  ALTER COLUMN id TYPE TEXT USING id::text,
  ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;

ALTER TABLE evidence_records
  ADD COLUMN provider_id TEXT NOT NULL,
  ADD COLUMN facility_id TEXT NOT NULL,
  ADD COLUMN file_name TEXT NOT NULL,
  ADD COLUMN mime_type TEXT NOT NULL,
  ADD COLUMN size_bytes BIGINT NOT NULL,
  ADD COLUMN uploaded_at TIMESTAMPTZ NOT NULL,
  ADD COLUMN extracted_text TEXT,
  ADD COLUMN page_count INT,
  ADD COLUMN ocr_confidence DOUBLE PRECISION,
  ADD COLUMN processing_metadata JSONB,
  ADD COLUMN ai_summary TEXT,
  ADD COLUMN ai_suggested_type TEXT,
  ADD COLUMN ai_suggested_type_confidence DOUBLE PRECISION,
  ADD COLUMN ai_relevant_regulations TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN ai_key_entities JSONB,
  ADD COLUMN ai_validation_report JSONB;

ALTER TABLE evidence_records
  ADD CONSTRAINT evidence_records_provider_id_fkey
  FOREIGN KEY (provider_id) REFERENCES providers(provider_id);

ALTER TABLE evidence_records
  ADD CONSTRAINT evidence_records_facility_id_fkey
  FOREIGN KEY (facility_id) REFERENCES facilities(facility_id);

CREATE INDEX IF NOT EXISTS idx_er_provider_id ON evidence_records(provider_id);
CREATE INDEX IF NOT EXISTS idx_er_facility_id ON evidence_records(facility_id);

-- Evidence blobs (malware scan status)
ALTER TABLE evidence_blobs
  ADD COLUMN scan_status evidence_scan_status NOT NULL DEFAULT 'PENDING',
  ADD COLUMN scanned_at TIMESTAMPTZ,
  ADD COLUMN scan_engine TEXT,
  ADD COLUMN scan_threat TEXT,
  ADD COLUMN scan_result TEXT,
  ADD COLUMN quarantined BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_eb_scan_status ON evidence_blobs(scan_status);

-- Audit events
ALTER TABLE audit_events
  ALTER COLUMN id TYPE TEXT USING id::text,
  ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::text;

-- Export records
CREATE TABLE IF NOT EXISTS export_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(provider_id),
  facility_id TEXT NOT NULL REFERENCES facilities(facility_id),
  session_id TEXT NOT NULL,
  format export_format NOT NULL,
  content TEXT NOT NULL,
  reporting_domain reporting_domain NOT NULL,
  mode report_mode NOT NULL,
  report_source_type TEXT NOT NULL,
  report_source_id TEXT NOT NULL,
  report_source_as_of TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT export_records_tenant_id_check CHECK (tenant_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_export_records_tenant_id ON export_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_export_records_provider_id ON export_records(provider_id);
CREATE INDEX IF NOT EXISTS idx_export_records_facility_id ON export_records(facility_id);
CREATE INDEX IF NOT EXISTS idx_export_records_session_id ON export_records(session_id);

-- Background jobs
CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  job_type background_job_type NOT NULL,
  status background_job_status NOT NULL,
  queue_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  result JSONB,
  error TEXT,
  attempts_made INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT background_jobs_tenant_id_check CHECK (tenant_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_tenant_id ON background_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_type ON background_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);

-- AI insights
CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES mock_inspection_sessions(id),
  provider_id TEXT NOT NULL REFERENCES providers(provider_id),
  facility_id TEXT NOT NULL REFERENCES facilities(facility_id),
  topic_id TEXT NOT NULL,
  insights JSONB NOT NULL,
  suggested_follow_up TEXT,
  risk_indicators JSONB NOT NULL,
  validation_report JSONB NOT NULL,
  used_fallback BOOLEAN NOT NULL DEFAULT false,
  fallback_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_insights_tenant_id_check CHECK (tenant_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_tenant_id ON ai_insights(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_session_id ON ai_insights(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_provider_id ON ai_insights(provider_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_facility_id ON ai_insights(facility_id);

-- Regulations
CREATE TABLE IF NOT EXISTS regulations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  domain domain NOT NULL,
  version INT NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL,
  supersedes TEXT,
  title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  CONSTRAINT regulations_tenant_id_check CHECK (tenant_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_regulations_tenant_id ON regulations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_regulations_domain ON regulations(domain);

CREATE TABLE IF NOT EXISTS regulation_sections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  regulation_id TEXT NOT NULL REFERENCES regulations(id),
  section_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  normative BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT regulation_sections_tenant_id_check CHECK (tenant_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_regulation_sections_tenant_id ON regulation_sections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_regulation_sections_regulation_id ON regulation_sections(regulation_id);
CREATE INDEX IF NOT EXISTS idx_regulation_sections_section_id ON regulation_sections(section_id);

-- Update tenant isolation policies (TEXT tenant_id)


ALTER TABLE provider_context_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_context_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_pcs ON provider_context_snapshots
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

ALTER TABLE mock_inspection_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_inspection_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_mis ON mock_inspection_sessions
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_se ON session_events
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

ALTER TABLE draft_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_findings FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_df ON draft_findings
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_f ON findings
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

ALTER TABLE evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_records FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_er ON evidence_records
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_ae ON audit_events
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_providers ON providers
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_facilities ON facilities
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

ALTER TABLE export_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_records FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_export_records ON export_records
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE background_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_background_jobs ON background_jobs
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_ai_insights ON ai_insights
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

ALTER TABLE regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulations FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_regulations ON regulations
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

ALTER TABLE regulation_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulation_sections FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_regulation_sections ON regulation_sections
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));
