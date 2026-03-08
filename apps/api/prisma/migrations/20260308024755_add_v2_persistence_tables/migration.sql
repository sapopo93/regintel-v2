/*
  Warnings:

  - Made the column `metadata` on table `evidence_records` required. This step will fail if there are existing NULL values in that column.
  - Made the column `is_follow_up` on table `session_events` required. This step will fail if there are existing NULL values in that column.
  - Made the column `metadata` on table `session_events` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "draft_findings" DROP CONSTRAINT "draft_findings_session_id_fkey";

-- DropForeignKey
ALTER TABLE "evidence_records" DROP CONSTRAINT "evidence_records_content_hash_fkey";

-- DropForeignKey
ALTER TABLE "findings" DROP CONSTRAINT "findings_context_snapshot_id_fkey";

-- DropForeignKey
ALTER TABLE "mock_inspection_sessions" DROP CONSTRAINT "mock_inspection_sessions_context_snapshot_id_fkey";

-- DropForeignKey
ALTER TABLE "session_events" DROP CONSTRAINT "session_events_session_id_fkey";

-- AlterTable
ALTER TABLE "evidence_records" ALTER COLUMN "metadata" SET NOT NULL,
ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "provider_context_snapshots" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "providers" ALTER COLUMN "service_types" DROP DEFAULT;

-- AlterTable
ALTER TABLE "session_events" ALTER COLUMN "is_follow_up" SET NOT NULL,
ALTER COLUMN "metadata" SET NOT NULL,
ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;

-- CreateTable
CREATE TABLE "mock_sessions_v2" (
    "session_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'MOCK',
    "provider_snapshot" JSONB NOT NULL,
    "topic_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "follow_ups_used" INTEGER NOT NULL DEFAULT 0,
    "max_follow_ups" INTEGER NOT NULL DEFAULT 4,
    "created_at" TEXT NOT NULL,
    "completed_at" TEXT,
    "topic_catalog_version" TEXT NOT NULL,
    "topic_catalog_hash" TEXT NOT NULL,
    "prs_logic_profiles_version" TEXT NOT NULL,
    "prs_logic_profiles_hash" TEXT NOT NULL,

    CONSTRAINT "mock_sessions_v2_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "findings_v2" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "regulation_section_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "reporting_domain" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "impact_score" INTEGER NOT NULL,
    "likelihood_score" INTEGER NOT NULL,
    "composite_risk_score" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence_required" TEXT[],
    "evidence_provided" TEXT[],
    "evidence_missing" TEXT[],
    "deterministic_hash" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "findings_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_blobs_v2" (
    "blob_hash" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_at" TEXT NOT NULL,

    CONSTRAINT "evidence_blobs_v2_pkey" PRIMARY KEY ("blob_hash")
);

-- CreateTable
CREATE TABLE "evidence_records_v2" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "blob_hash" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "description" TEXT,
    "uploaded_at" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "evidence_records_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exports_v2" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "reporting_domain" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "report_source" JSONB NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "generated_at" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,

    CONSTRAINT "exports_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events_v2" (
    "event_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "previous_event_hash" TEXT,
    "event_hash" TEXT NOT NULL,
    "payload" JSONB,

    CONSTRAINT "audit_events_v2_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE INDEX "mock_sessions_v2_tenant_id_idx" ON "mock_sessions_v2"("tenant_id");

-- CreateIndex
CREATE INDEX "mock_sessions_v2_provider_id_idx" ON "mock_sessions_v2"("provider_id");

-- CreateIndex
CREATE INDEX "findings_v2_tenant_id_idx" ON "findings_v2"("tenant_id");

-- CreateIndex
CREATE INDEX "findings_v2_provider_id_idx" ON "findings_v2"("provider_id");

-- CreateIndex
CREATE INDEX "evidence_records_v2_tenant_id_idx" ON "evidence_records_v2"("tenant_id");

-- CreateIndex
CREATE INDEX "evidence_records_v2_facility_id_idx" ON "evidence_records_v2"("facility_id");

-- CreateIndex
CREATE INDEX "exports_v2_tenant_id_idx" ON "exports_v2"("tenant_id");

-- CreateIndex
CREATE INDEX "exports_v2_provider_id_idx" ON "exports_v2"("provider_id");

-- CreateIndex
CREATE INDEX "audit_events_v2_tenant_id_idx" ON "audit_events_v2"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_events_v2_provider_id_timestamp_idx" ON "audit_events_v2"("provider_id", "timestamp");

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

-- RenameIndex
ALTER INDEX "idx_ae_entity" RENAME TO "audit_events_tenant_id_entity_type_entity_id_idx";

-- RenameIndex
ALTER INDEX "idx_ae_event_hash" RENAME TO "audit_events_tenant_id_event_hash_key";

-- RenameIndex
ALTER INDEX "idx_ae_tenant_sequence" RENAME TO "audit_events_tenant_id_timestamp_idx";

-- RenameIndex
ALTER INDEX "idx_df_session_id" RENAME TO "draft_findings_session_id_idx";

-- RenameIndex
ALTER INDEX "idx_df_tenant_id" RENAME TO "draft_findings_tenant_id_idx";

-- RenameIndex
ALTER INDEX "idx_eb_uploaded_at" RENAME TO "evidence_blobs_uploaded_at_idx";

-- RenameIndex
ALTER INDEX "idx_er_content_hash" RENAME TO "evidence_records_content_hash_idx";

-- RenameIndex
ALTER INDEX "idx_er_evidence_type" RENAME TO "evidence_records_tenant_id_evidence_type_idx";

-- RenameIndex
ALTER INDEX "idx_er_tenant_id" RENAME TO "evidence_records_tenant_id_idx";

-- RenameIndex
ALTER INDEX "idx_facilities_provider_id" RENAME TO "facilities_provider_id_idx";

-- RenameIndex
ALTER INDEX "idx_facilities_tenant_id" RENAME TO "facilities_tenant_id_idx";

-- RenameIndex
ALTER INDEX "idx_f_context_snapshot" RENAME TO "findings_context_snapshot_id_idx";

-- RenameIndex
ALTER INDEX "idx_f_domain" RENAME TO "findings_tenant_id_domain_idx";

-- RenameIndex
ALTER INDEX "idx_f_origin" RENAME TO "findings_tenant_id_origin_idx";

-- RenameIndex
ALTER INDEX "idx_f_reporting_domain" RENAME TO "findings_tenant_id_reporting_domain_idx";

-- RenameIndex
ALTER INDEX "idx_f_severity" RENAME TO "findings_tenant_id_severity_composite_risk_score_idx";

-- RenameIndex
ALTER INDEX "idx_f_tenant_id" RENAME TO "findings_tenant_id_idx";

-- RenameIndex
ALTER INDEX "idx_mis_context_snapshot" RENAME TO "mock_inspection_sessions_context_snapshot_id_idx";

-- RenameIndex
ALTER INDEX "idx_mis_status" RENAME TO "mock_inspection_sessions_tenant_id_status_idx";

-- RenameIndex
ALTER INDEX "idx_mis_tenant_id" RENAME TO "mock_inspection_sessions_tenant_id_idx";

-- RenameIndex
ALTER INDEX "idx_pcs_as_of" RENAME TO "provider_context_snapshots_tenant_id_as_of_idx";

-- RenameIndex
ALTER INDEX "idx_pcs_snapshot_hash" RENAME TO "provider_context_snapshots_tenant_id_snapshot_hash_key";

-- RenameIndex
ALTER INDEX "idx_pcs_tenant_id" RENAME TO "provider_context_snapshots_tenant_id_idx";

-- RenameIndex
ALTER INDEX "idx_providers_tenant_id" RENAME TO "providers_tenant_id_idx";

-- RenameIndex
ALTER INDEX "idx_se_session_id" RENAME TO "session_events_session_id_timestamp_idx";

-- RenameIndex
ALTER INDEX "idx_se_tenant_id" RENAME TO "session_events_tenant_id_idx";
