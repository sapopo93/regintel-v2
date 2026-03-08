CREATE TABLE IF NOT EXISTS "document_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "evidence_record_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "overall_result" TEXT,
    "compliance_score" INTEGER,
    "critical_findings" INTEGER NOT NULL DEFAULT 0,
    "high_findings" INTEGER NOT NULL DEFAULT 0,
    "audit_result_json" JSONB,
    "failure_reason" TEXT,
    "audited_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_audits_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "document_audits" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "document_audits" ADD COLUMN IF NOT EXISTS "failure_reason" TEXT;
ALTER TABLE "document_audits" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "document_audits" ALTER COLUMN "overall_result" DROP NOT NULL;
ALTER TABLE "document_audits" ALTER COLUMN "compliance_score" DROP NOT NULL;
ALTER TABLE "document_audits" ALTER COLUMN "audit_result_json" DROP NOT NULL;
ALTER TABLE "document_audits" ALTER COLUMN "audited_at" DROP NOT NULL;
ALTER TABLE "document_audits" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "document_audits" ALTER COLUMN "critical_findings" SET DEFAULT 0;
ALTER TABLE "document_audits" ALTER COLUMN "high_findings" SET DEFAULT 0;
ALTER TABLE "document_audits" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "document_audits" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

UPDATE "document_audits"
   SET "status" = 'COMPLETED'
 WHERE "status" IS NULL;

UPDATE "document_audits"
   SET "updated_at" = COALESCE("updated_at", "created_at", CURRENT_TIMESTAMP)
 WHERE "updated_at" IS NULL;

ALTER TABLE "document_audits" DROP CONSTRAINT IF EXISTS "document_audits_evidence_record_id_key";
DROP INDEX IF EXISTS "document_audits_evidence_record_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "document_audits_tenant_id_evidence_record_id_key"
    ON "document_audits"("tenant_id", "evidence_record_id");
CREATE INDEX IF NOT EXISTS "document_audits_tenant_id_facility_id_idx"
    ON "document_audits"("tenant_id", "facility_id");
CREATE INDEX IF NOT EXISTS "document_audits_tenant_id_status_idx"
    ON "document_audits"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "document_audits_tenant_id_document_type_idx"
    ON "document_audits"("tenant_id", "document_type");
CREATE INDEX IF NOT EXISTS "document_audits_facility_id_audited_at_idx"
    ON "document_audits"("facility_id", "audited_at");
