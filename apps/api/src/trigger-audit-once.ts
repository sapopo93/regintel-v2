import { runDocumentAuditForEvidence } from './document-auditor';
import { prisma } from './db';

async function main() {
  const record = await prisma.evidenceRecord.findUnique({
    where: { id: '8851b0ae-c292-4517-ad46-16be369eb4d4' }
  });
  if (!record) { console.log('NOT FOUND'); process.exit(1); }
  console.log('Auditing:', record.title);
  const result = await runDocumentAuditForEvidence({
    tenantId: record.tenantId,
    facilityId: 'user_3AIES1GCDtCTHiWtOVORHxazY1s:facility-2',
    providerId: 'user_3AIES1GCDtCTHiWtOVORHxazY1s:provider-1',
    record
  });
  console.log('DONE - overall:', result?.overallResult, 'score:', result?.complianceScore);
  await prisma.$disconnect();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
