import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { runDocumentAuditForEvidence } from './document-auditor';

const prisma = new PrismaClient();

async function run() {
  const evidenceRecordId = process.argv[2];
  if (!evidenceRecordId) {
    throw new Error('Usage: tsx src/trigger-audit.ts <evidence-record-id>');
  }

  const record = await prisma.evidenceRecord.findUnique({
    where: { id: evidenceRecordId },
    include: { blob: true },
  });

  if (!record) {
    throw new Error(`Evidence record not found: ${evidenceRecordId}`);
  }

  const metadata = (record.metadata ?? {}) as Record<string, unknown>;
  const facilityId = typeof metadata.facilityId === 'string' ? metadata.facilityId : '';
  const providerId = typeof metadata.providerId === 'string' ? metadata.providerId : '';
  const fileName = typeof metadata.fileName === 'string' ? metadata.fileName : record.title;
  const mimeType = typeof metadata.mimeType === 'string'
    ? metadata.mimeType
    : (record.blob?.contentType ?? 'application/octet-stream');

  if (!facilityId || !providerId) {
    throw new Error('Evidence record metadata is missing facilityId or providerId.');
  }

  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
  });

  const summary = await runDocumentAuditForEvidence({
    tenantId: record.tenantId,
    facilityId,
    facilityName: facility?.facilityName ?? 'Unknown facility',
    providerId,
    evidenceRecordId: record.id,
    blobHash: record.contentHash,
    fileName,
    mimeType,
    evidenceType: record.evidenceType,
  });

  console.log('[RESULT]', JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
