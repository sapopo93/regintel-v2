-- AlterTable
ALTER TABLE "evidence_records" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "provider_context_snapshots" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "session_events" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "domain" "domain" NOT NULL,
    "category" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topics_tenant_id_domain_category_idx" ON "topics"("tenant_id", "domain", "category");

-- CreateIndex
CREATE UNIQUE INDEX "topics_tenant_id_name_version_key" ON "topics"("tenant_id", "name", "version");
