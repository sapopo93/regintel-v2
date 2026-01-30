CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE provider_regulatory_state AS ENUM (
  'NEW_PROVIDER',
  'ESTABLISHED',
  'SPECIAL_MEASURES',
  'ENFORCEMENT_ACTION',
  'RATING_INADEQUATE',
  'RATING_REQUIRES_IMPROVEMENT',
  'REOPENED_SERVICE',
  'MERGED_SERVICE'
);

CREATE TYPE domain AS ENUM ('CQC', 'IMMIGRATION');

CREATE TYPE mock_session_status AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

CREATE TYPE session_event_type AS ENUM (
  'SESSION_STARTED',
  'QUESTION_ASKED',
  'ANSWER_RECEIVED',
  'FINDING_DRAFTED',
  'SESSION_COMPLETED'
);

CREATE TYPE severity AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

CREATE TYPE finding_origin AS ENUM ('SYSTEM_MOCK', 'ACTUAL_INSPECTION', 'SELF_IDENTIFIED');

CREATE TYPE reporting_domain AS ENUM ('REGULATORY_HISTORY', 'MOCK_SIMULATION');

CREATE TABLE provider_context_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  regulatory_state provider_regulatory_state NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled_domains TEXT[] NOT NULL,
  active_regulation_ids TEXT[] NOT NULL,
  active_policy_ids TEXT[] NOT NULL,
  snapshot_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,

  CONSTRAINT pcs_tenant_id_check CHECK (tenant_id IS NOT NULL)
);

CREATE INDEX idx_pcs_tenant_id ON provider_context_snapshots(tenant_id);
CREATE INDEX idx_pcs_as_of ON provider_context_snapshots(tenant_id, as_of);
CREATE UNIQUE INDEX idx_pcs_snapshot_hash ON provider_context_snapshots(tenant_id, snapshot_hash);

ALTER TABLE provider_context_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_context_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_pcs ON provider_context_snapshots
  USING (tenant_id = current_setting('app.tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE TABLE mock_inspection_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  domain domain NOT NULL,
  context_snapshot_id UUID NOT NULL REFERENCES provider_context_snapshots(id),
  logic_profile_id TEXT NOT NULL,
  status mock_session_status NOT NULL DEFAULT 'IN_PROGRESS',
  total_questions_asked INT NOT NULL DEFAULT 0,
  total_findings_drafted INT NOT NULL DEFAULT 0,
  max_followups_per_topic INT NOT NULL,
  max_total_questions INT NOT NULL,
  session_hash TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,

  CONSTRAINT mis_tenant_id_check CHECK (tenant_id IS NOT NULL)
);

CREATE INDEX idx_mis_tenant_id ON mock_inspection_sessions(tenant_id);
CREATE INDEX idx_mis_status ON mock_inspection_sessions(tenant_id, status);
CREATE INDEX idx_mis_context_snapshot ON mock_inspection_sessions(context_snapshot_id);

ALTER TABLE mock_inspection_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_inspection_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_mis ON mock_inspection_sessions
  USING (tenant_id = current_setting('app.tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE TABLE session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES mock_inspection_sessions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  event_type session_event_type NOT NULL,
  topic_id TEXT,
  question TEXT,
  provider_response TEXT,
  is_follow_up BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT se_tenant_id_check CHECK (tenant_id IS NOT NULL)
);

CREATE INDEX idx_se_session_id ON session_events(session_id, timestamp);
CREATE INDEX idx_se_tenant_id ON session_events(tenant_id);

ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_se ON session_events
  USING (tenant_id = current_setting('app.tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE TABLE draft_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES mock_inspection_sessions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity severity NOT NULL,
  impact_score INT NOT NULL,
  likelihood_score INT NOT NULL,
  composite_risk_score INT NOT NULL,
  regulation_id TEXT NOT NULL,
  regulation_section_id TEXT NOT NULL,
  evidence_gaps TEXT[] DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT df_tenant_id_check CHECK (tenant_id IS NOT NULL),
  CONSTRAINT df_impact_score_check CHECK (impact_score BETWEEN 0 AND 100),
  CONSTRAINT df_likelihood_score_check CHECK (likelihood_score BETWEEN 0 AND 100),
  CONSTRAINT df_composite_risk_score_check CHECK (composite_risk_score BETWEEN 0 AND 100)
);

CREATE INDEX idx_df_session_id ON draft_findings(session_id);
CREATE INDEX idx_df_tenant_id ON draft_findings(tenant_id);

ALTER TABLE draft_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_findings FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_df ON draft_findings
  USING (tenant_id = current_setting('app.tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE TABLE findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  domain domain NOT NULL,
  context_snapshot_id UUID NOT NULL REFERENCES provider_context_snapshots(id),
  origin finding_origin NOT NULL,
  reporting_domain reporting_domain NOT NULL,
  regulation_id TEXT NOT NULL,
  regulation_section_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity severity NOT NULL,
  impact_score INT NOT NULL,
  likelihood_score INT NOT NULL,
  composite_risk_score INT NOT NULL,
  evidence_ids TEXT[] DEFAULT '{}'::text[],
  identified_at TIMESTAMPTZ NOT NULL,
  identified_by TEXT NOT NULL,
  finding_hash TEXT NOT NULL,

  CONSTRAINT f_tenant_id_check CHECK (tenant_id IS NOT NULL),
  CONSTRAINT f_mock_separation_check CHECK (
    (origin = 'SYSTEM_MOCK' AND reporting_domain = 'MOCK_SIMULATION') OR
    (origin != 'SYSTEM_MOCK' AND reporting_domain = 'REGULATORY_HISTORY')
  ),
  CONSTRAINT f_impact_score_check CHECK (impact_score BETWEEN 0 AND 100),
  CONSTRAINT f_likelihood_score_check CHECK (likelihood_score BETWEEN 0 AND 100),
  CONSTRAINT f_composite_risk_score_check CHECK (composite_risk_score BETWEEN 0 AND 100)
);

CREATE INDEX idx_f_tenant_id ON findings(tenant_id);
CREATE INDEX idx_f_domain ON findings(tenant_id, domain);
CREATE INDEX idx_f_origin ON findings(tenant_id, origin);
CREATE INDEX idx_f_reporting_domain ON findings(tenant_id, reporting_domain);
CREATE INDEX idx_f_context_snapshot ON findings(context_snapshot_id);
CREATE INDEX idx_f_severity ON findings(tenant_id, severity, composite_risk_score DESC);

ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_f ON findings
  USING (tenant_id = current_setting('app.tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE TABLE evidence_blobs (
  content_hash TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT eb_content_hash_check CHECK (content_hash LIKE 'sha256:%')
);

CREATE INDEX idx_eb_uploaded_at ON evidence_blobs(uploaded_at);

CREATE TABLE evidence_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  content_hash TEXT NOT NULL REFERENCES evidence_blobs(content_hash),
  evidence_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  collected_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,

  CONSTRAINT er_tenant_id_check CHECK (tenant_id IS NOT NULL)
);

CREATE INDEX idx_er_tenant_id ON evidence_records(tenant_id);
CREATE INDEX idx_er_content_hash ON evidence_records(content_hash);
CREATE INDEX idx_er_evidence_type ON evidence_records(tenant_id, evidence_type);

ALTER TABLE evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_records FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_er ON evidence_records
  USING (tenant_id = current_setting('app.tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ae_tenant_id_check CHECK (tenant_id IS NOT NULL)
);

CREATE UNIQUE INDEX idx_ae_event_hash ON audit_events(tenant_id, event_hash);
CREATE INDEX idx_ae_tenant_sequence ON audit_events(tenant_id, timestamp);
CREATE INDEX idx_ae_entity ON audit_events(tenant_id, entity_type, entity_id);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_ae ON audit_events
  USING (tenant_id = current_setting('app.tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::UUID);
