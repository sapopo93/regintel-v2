import { auditDocument } from './document-auditor';
import { PrismaClient } from './node_modules/.prisma/client';

const prisma = new PrismaClient();

async function run() {
  const evidenceRecordId = 'fa7eb7e8-cb05-4c1d-ae55-36fafde5e903';
  const tenantId = 'user_3AIES1GCDtCTHiWtOVORHxazY1s';
  const facilityId = 'user_3AIES1GCDtCTHiWtOVORHxazY1s:facility-2';
  const providerId = 'user_3AIES1GCDtCTHiWtOVORHxazY1s:provider-1';

  console.log('[TRIGGER] Starting audit for', evidenceRecordId);
  const result = await auditDocument({ evidenceRecordId, tenantId, facilityId, providerId, prisma });
  console.log('[RESULT]', JSON.stringify({ 
    overallResult: result.overallResult, 
    complianceScore: result.complianceScore,
    findings: result.findings.length,
    summary: result.summary
  }, null, 2));
  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
// dummy export to make it a module
export {};
