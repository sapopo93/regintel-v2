-- CQC Intelligence Alerts
CREATE TABLE "cqc_intelligence_alerts_v2" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "facility_ids" TEXT NOT NULL,
    "intelligence_type" TEXT NOT NULL,
    "source_location_id" TEXT NOT NULL,
    "source_location_name" TEXT NOT NULL,
    "source_service_type" TEXT NOT NULL,
    "report_date" TEXT NOT NULL,
    "key_question" TEXT NOT NULL,
    "quality_statement_id" TEXT NOT NULL,
    "quality_statement_title" TEXT NOT NULL,
    "finding_text" TEXT NOT NULL,
    "provider_coverage_percent" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "dismissed_at" TEXT,

    CONSTRAINT "cqc_intelligence_alerts_v2_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cqc_intelligence_alerts_v2_tenant_id_idx" ON "cqc_intelligence_alerts_v2"("tenant_id");
CREATE INDEX "cqc_intelligence_alerts_v2_provider_id_idx" ON "cqc_intelligence_alerts_v2"("provider_id");
CREATE INDEX "cqc_intelligence_alerts_v2_dedup_idx" ON "cqc_intelligence_alerts_v2"("tenant_id", "provider_id", "source_location_id", "quality_statement_id", "report_date");

-- CQC Intelligence Poll State
CREATE TABLE "cqc_intelligence_poll_state_v2" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "last_polled_at" TEXT NOT NULL,

    CONSTRAINT "cqc_intelligence_poll_state_v2_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cqc_intelligence_poll_state_v2_tenant_id_idx" ON "cqc_intelligence_poll_state_v2"("tenant_id");

-- Usage Events (billing hooks for future pricing)
CREATE TABLE "usage_events_v2" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "created_at" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "usage_events_v2_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "usage_events_v2_tenant_id_idx" ON "usage_events_v2"("tenant_id");
CREATE INDEX "usage_events_v2_tenant_event_type_idx" ON "usage_events_v2"("tenant_id", "provider_id", "event_type");
CREATE INDEX "usage_events_v2_tenant_created_idx" ON "usage_events_v2"("tenant_id", "created_at");
