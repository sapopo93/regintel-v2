-- Create providers table
-- Uses TEXT primary key (tenantId:provider-N scoped key format)
CREATE TABLE IF NOT EXISTS providers (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  provider_name  TEXT NOT NULL,
  org_ref        TEXT,
  as_of          TEXT NOT NULL,
  prs_state      TEXT NOT NULL DEFAULT 'STABLE',
  registered_beds INT NOT NULL DEFAULT 0,
  service_types  TEXT[] NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL,
  created_by     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_providers_tenant_id ON providers(tenant_id);

-- Create facilities table
-- Uses TEXT primary key (tenantId:facility-N scoped key format)
CREATE TABLE IF NOT EXISTS facilities (
  id                       TEXT PRIMARY KEY,
  tenant_id                TEXT NOT NULL,
  provider_id              TEXT NOT NULL,
  facility_name            TEXT NOT NULL,
  address_line1            TEXT NOT NULL,
  town_city                TEXT NOT NULL,
  postcode                 TEXT NOT NULL,
  address                  TEXT NOT NULL,
  cqc_location_id          TEXT NOT NULL,
  service_type             TEXT NOT NULL,
  capacity                 INT,
  facility_hash            TEXT NOT NULL,
  data_source              TEXT NOT NULL DEFAULT 'MANUAL',
  cqc_synced_at            TEXT,
  latest_rating            TEXT,
  latest_rating_date       TEXT,
  inspection_status        TEXT NOT NULL DEFAULT 'NEVER_INSPECTED',
  last_report_scraped_at   TEXT,
  last_scraped_report_date TEXT,
  last_scraped_report_url  TEXT,
  created_at               TEXT NOT NULL,
  created_by               TEXT NOT NULL,
  as_of                    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_facilities_tenant_id ON facilities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_facilities_provider_id ON facilities(provider_id);
