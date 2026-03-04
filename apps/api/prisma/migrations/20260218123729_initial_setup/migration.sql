-- CreateEnum
CREATE TYPE "provider_regulatory_state" AS ENUM ('NEW_PROVIDER', 'ESTABLISHED', 'SPECIAL_MEASURES', 'ENFORCEMENT_ACTION', 'RATING_INADEQUATE', 'RATING_REQUIRES_IMPROVEMENT', 'REOPENED_SERVICE', 'MERGED_SERVICE');

-- CreateEnum
CREATE TYPE "domain" AS ENUM ('CQC', 'IMMIGRATION');

-- CreateEnum
CREATE TYPE "mock_session_status" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "session_event_type" AS ENUM ('SESSION_STARTED', 'QUESTION_ASKED', 'ANSWER_RECEIVED', 'FINDING_DRAFTED', 'SESSION_COMPLETED');

-- CreateEnum
CREATE TYPE "severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "finding_origin" AS ENUM ('SYSTEM_MOCK', 'ACTUAL_INSPECTION', 'SELF_IDENTIFIED');

-- CreateEnum
CREATE TYPE "reporting_domain" AS ENUM ('REGULATORY_HISTORY', 'MOCK_SIMULATION');

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cqc_id" TEXT,
    "address" TEXT,
    "registered_manager" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "service_type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_context_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "as_of" TIMESTAMPTZ NOT NULL,
    "regulatory_state" "provider_regulatory_state" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "enabled_domains" TEXT[],
    "active_regulation_ids" TEXT[],
    "active_policy_ids" TEXT[],
    "snapshot_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "provider_context_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mock_inspection_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "domain" "domain" NOT NULL,
    "context_snapshot_id" UUID NOT NULL,
    "logic_profile_id" TEXT NOT NULL,
    "status" "mock_session_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "total_questions_asked" INTEGER NOT NULL DEFAULT 0,
    "total_findings_drafted" INTEGER NOT NULL DEFAULT 0,
    "max_followups_per_topic" INTEGER NOT NULL,
    "max_total_questions" INTEGER NOT NULL,
    "session_hash" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "mock_inspection_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_type" "session_event_type" NOT NULL,
    "topic_id" TEXT,
    "question" TEXT,
    "provider_response" TEXT,
    "is_follow_up" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "severity" NOT NULL,
    "impact_score" INTEGER NOT NULL,
    "likelihood_score" INTEGER NOT NULL,
    "composite_risk_score" INTEGER NOT NULL,
    "regulation_id" TEXT NOT NULL,
    "regulation_section_id" TEXT NOT NULL,
    "evidence_gaps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "domain" "domain" NOT NULL,
    "context_snapshot_id" UUID NOT NULL,
    "origin" "finding_origin" NOT NULL,
    "reporting_domain" "reporting_domain" NOT NULL,
    "regulation_id" TEXT NOT NULL,
    "regulation_section_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "severity" NOT NULL,
    "impact_score" INTEGER NOT NULL,
    "likelihood_score" INTEGER NOT NULL,
    "composite_risk_score" INTEGER NOT NULL,
    "evidence_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "identified_at" TIMESTAMPTZ NOT NULL,
    "identified_by" TEXT NOT NULL,
    "finding_hash" TEXT NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_blobs" (
    "content_hash" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_blobs_pkey" PRIMARY KEY ("content_hash")
);

-- CreateTable
CREATE TABLE "evidence_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "collected_at" TIMESTAMPTZ NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "evidence_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "previous_event_hash" TEXT,
    "event_hash" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "providers_cqc_id_key" ON "providers"("cqc_id");

-- CreateIndex
CREATE UNIQUE INDEX "providers_tenant_id_cqc_id_key" ON "providers"("tenant_id", "cqc_id");

-- CreateIndex
CREATE INDEX "provider_context_snapshots_tenant_id_idx" ON "provider_context_snapshots"("tenant_id");

-- CreateIndex
CREATE INDEX "provider_context_snapshots_tenant_id_as_of_idx" ON "provider_context_snapshots"("tenant_id", "as_of");

-- CreateIndex
CREATE UNIQUE INDEX "provider_context_snapshots_tenant_id_snapshot_hash_key" ON "provider_context_snapshots"("tenant_id", "snapshot_hash");

-- CreateIndex
CREATE INDEX "mock_inspection_sessions_tenant_id_idx" ON "mock_inspection_sessions"("tenant_id");

-- CreateIndex
CREATE INDEX "mock_inspection_sessions_tenant_id_status_idx" ON "mock_inspection_sessions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "mock_inspection_sessions_context_snapshot_id_idx" ON "mock_inspection_sessions"("context_snapshot_id");

-- CreateIndex
CREATE INDEX "session_events_session_id_timestamp_idx" ON "session_events"("session_id", "timestamp");

-- CreateIndex
CREATE INDEX "session_events_tenant_id_idx" ON "session_events"("tenant_id");

-- CreateIndex
CREATE INDEX "draft_findings_session_id_idx" ON "draft_findings"("session_id");

-- CreateIndex
CREATE INDEX "draft_findings_tenant_id_idx" ON "draft_findings"("tenant_id");

-- CreateIndex
CREATE INDEX "findings_tenant_id_idx" ON "findings"("tenant_id");

-- CreateIndex
CREATE INDEX "findings_tenant_id_domain_idx" ON "findings"("tenant_id", "domain");

-- CreateIndex
CREATE INDEX "findings_tenant_id_origin_idx" ON "findings"("tenant_id", "origin");

-- CreateIndex
CREATE INDEX "findings_tenant_id_reporting_domain_idx" ON "findings"("tenant_id", "reporting_domain");

-- CreateIndex
CREATE INDEX "findings_context_snapshot_id_idx" ON "findings"("context_snapshot_id");

-- CreateIndex
CREATE INDEX "findings_tenant_id_severity_composite_risk_score_idx" ON "findings"("tenant_id", "severity", "composite_risk_score" DESC);

-- CreateIndex
CREATE INDEX "evidence_blobs_uploaded_at_idx" ON "evidence_blobs"("uploaded_at");

-- CreateIndex
CREATE INDEX "evidence_records_tenant_id_idx" ON "evidence_records"("tenant_id");

-- CreateIndex
CREATE INDEX "evidence_records_content_hash_idx" ON "evidence_records"("content_hash");

-- CreateIndex
CREATE INDEX "evidence_records_tenant_id_evidence_type_idx" ON "evidence_records"("tenant_id", "evidence_type");

-- CreateIndex
CREATE INDEX "audit_events_tenant_id_timestamp_idx" ON "audit_events"("tenant_id", "timestamp");

-- CreateIndex
CREATE INDEX "audit_events_tenant_id_entity_type_entity_id_idx" ON "audit_events"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_tenant_id_event_hash_key" ON "audit_events"("tenant_id", "event_hash");

-- AddForeignKey
ALTER TABLE "provider_context_snapshots" ADD CONSTRAINT "provider_context_snapshots_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_inspection_sessions" ADD CONSTRAINT "mock_inspection_sessions_context_snapshot_id_fkey" FOREIGN KEY ("context_snapshot_id") REFERENCES "provider_context_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "mock_inspection_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_findings" ADD CONSTRAINT "draft_findings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "mock_inspection_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_context_snapshot_id_fkey" FOREIGN KEY ("context_snapshot_id") REFERENCES "provider_context_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_content_hash_fkey" FOREIGN KEY ("content_hash") REFERENCES "evidence_blobs"("content_hash") ON DELETE RESTRICT ON UPDATE CASCADE;
