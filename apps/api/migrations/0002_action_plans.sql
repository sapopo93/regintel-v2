-- Action Plans (V2 write-through cache table)
-- Groups of actions per finding, derived from mock inspection findings.
-- "Plan" is computed at read time — no separate plan table.

CREATE TABLE IF NOT EXISTS actions_v2 (
  id                        TEXT PRIMARY KEY,
  tenant_id                 TEXT NOT NULL,
  provider_id               TEXT NOT NULL,
  facility_id               TEXT NOT NULL,
  finding_id                TEXT NOT NULL,
  topic_id                  TEXT NOT NULL,
  domain                    TEXT NOT NULL DEFAULT 'CQC',
  reporting_domain          TEXT NOT NULL DEFAULT 'MOCK_SIMULATION',
  description               TEXT NOT NULL,
  title                     TEXT NOT NULL,
  category                  TEXT NOT NULL,   -- POLICY | EVIDENCE | TRAINING | PROCESS | DOCUMENTATION
  priority                  TEXT NOT NULL,   -- HIGH | MEDIUM | LOW
  assigned_to               TEXT,            -- role name (e.g. "Registered Manager")
  target_completion_date    TEXT,            -- ISO date
  status                    TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN | IN_PROGRESS | PENDING_VERIFICATION | VERIFIED_CLOSED | REJECTED
  verification_evidence_ids TEXT[] DEFAULT '{}',
  sort_order                INTEGER NOT NULL DEFAULT 0,
  created_at                TEXT NOT NULL,
  created_by                TEXT NOT NULL,
  completed_at              TEXT,
  verified_at               TEXT,
  notes                     TEXT,
  source                    TEXT NOT NULL DEFAULT 'TEMPLATE'  -- TEMPLATE | DOCUMENT_AUDIT
);

CREATE INDEX IF NOT EXISTS idx_actions_v2_tenant ON actions_v2(tenant_id);
CREATE INDEX IF NOT EXISTS idx_actions_v2_provider ON actions_v2(provider_id);
CREATE INDEX IF NOT EXISTS idx_actions_v2_facility ON actions_v2(facility_id);
CREATE INDEX IF NOT EXISTS idx_actions_v2_finding ON actions_v2(finding_id);
