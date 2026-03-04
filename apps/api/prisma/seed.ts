import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const tenantId = 'demo'; // From .env

  console.log(`Seeding data for tenant: ${tenantId}`);

  // Create a demo care provider (Ekklesia Healthcare)
  const provider = await prisma.provider.upsert({
    where: { id: `${tenantId}:ekklesia-healthcare` },
    update: {},
    create: {
      id: `${tenantId}:ekklesia-healthcare`,
      tenantId: tenantId,
      name: 'Ekklesia Healthcare',
      cqcId: '1-123456789', // Mock CQC ID
      address: '123 Care Street, London, SW1A 0AA',
      registeredManager: 'Dr. Sarah Jones',
      phone: '020 7946 0000',
      email: 'info@ekklesia.co.uk',
      serviceType: 'Domiciliary Care Agency',
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE',
    },
  });
  console.log(`Created provider: ${provider.name} (${provider.id})`);

  // Create a provider context snapshot
  const snapshot = await prisma.providerContextSnapshot.create({
    data: {
      tenantId: tenantId,
      providerId: provider.id,
      metadata: {
        currentPhase: 'Phase 11 (Blue Ocean)',
        riskProfile: 'LOW_RISK',
      },
      regulatoryState: 'NEW_PROVIDER', // Correctly added
      asOf: new Date(),
      createdAt: new Date(),
      createdBy: 'seed-script', // Added createdBy as it's required by schema
      enabledDomains: ['CQC'], // Added required field
      activeRegulationIds: [], // Added required field
      activePolicyIds: [], // Added required field
      snapshotHash: randomUUID(), // Added required field
    },
  });
  console.log(`Created provider context snapshot: ${snapshot.id}`);

  // Create a mock inspection session
  const mockSession = await prisma.mockInspectionSession.create({
    data: {
      tenantId: tenantId,
      domain: 'CQC', // Added required field
      contextSnapshotId: snapshot.id,
      logicProfileId: 'default-profile', // Added required field
      status: 'IN_PROGRESS',
      totalQuestionsAsked: 0, // Added required field
      totalFindingsDrafted: 0, // Added required field
      maxFollowupsPerTopic: 3, // Added required field
      maxTotalQuestions: 10, // Added required field
      sessionHash: randomUUID(), // Added required field
      startedAt: new Date(),
      createdBy: 'seed-script',
    },
  });
  console.log(`Created mock inspection session: ${mockSession.id}`); // Changed to mockSession.id

  // Create a regulatory topic
  const topicSafe = await prisma.topic.upsert({
    where: { id: `${tenantId}:topic-safe` },
    update: {},
    create: {
      id: `${tenantId}:topic-safe`,
      tenantId: tenantId,
      name: 'Safe Care and Treatment',
      description: 'Ensuring people are protected from abuse and neglect.',
      domain: 'CQC',
      category: 'Key Question',
      version: 'v1',
      metadata: {
        regulations: ['Regulation 12: Safe care and treatment'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  console.log(`Created topic: ${topicSafe.name}`);

  // Create a finding
  const finding1 = await prisma.finding.create({
    data: {
      tenantId: tenantId,
      domain: 'CQC', // Added required field
      contextSnapshotId: snapshot.id,
      origin: 'SYSTEM_MOCK',
      reportingDomain: 'MOCK_SIMULATION', // Changed to MOCK_SIMULATION based on schema
      regulationId: 'REG-12', // Added required field
      regulationSectionId: 'REG-12.1', // Added required field
      title: 'Medication Discrepancies', // Added required field
      description: 'Review of medication administration records identified minor discrepancies in two patient files.',
      severity: 'LOW',
      impactScore: 1, // Added required field
      likelihoodScore: 1, // Added required field
      compositeRiskScore: 1, // Added required field
      evidenceIds: [], // Added required field
      identifiedAt: new Date(), // Added required field
      identifiedBy: 'seed-script', // Added required field
      findingHash: randomUUID(), // Added required field
    },
  });
  console.log(`Created finding: ${finding1.id}`);

  // Create an evidence blob and record
  const evidenceBlob1 = await prisma.evidenceBlob.create({
    data: {
      contentHash: `hash-${randomUUID()}`, // Changed to contentHash
      contentType: 'application/pdf', // Changed to contentType
      sizeBytes: BigInt(1024), // Changed to BigInt
      storagePath: '/var/regintel/evidence-blobs/mockhash123.pdf', // Changed to storagePath
      uploadedAt: new Date(),
    },
  });
  const evidenceRecord1 = await prisma.evidenceRecord.create({
    data: {
      tenantId: tenantId,
      contentHash: evidenceBlob1.contentHash,
      evidenceType: 'DOCUMENT',
      title: 'Medication Audit Report Q4 2025.pdf',
      description: 'Internal audit report for Q4 2025 on medication administration.',
      collectedAt: new Date(),
      createdBy: 'seed-script',
      metadata: {
        dateUploaded: new Date().toISOString(),
      },
    },
  });
  console.log(`Created evidence record: ${evidenceRecord1.id}`);

  // Add more topics for realism
  const topicEffective = await prisma.topic.upsert({
    where: { id: `${tenantId}:topic-effective` },
    update: {},
    create: {
      id: `${tenantId}:topic-effective`,
      tenantId: tenantId,
      name: 'Effective Care and Treatment',
      description: 'Assessing if people\'s care, treatment and support achieves good outcomes.',
      domain: 'CQC',
      category: 'Key Question',
      version: 'v1',
      metadata: {
        regulations: ['Regulation 9: Person-centred care', 'Regulation 17: Good governance'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  console.log(`Created topic: ${topicEffective.name}`);

  const topicCaring = await prisma.topic.upsert({
    where: { id: `${tenantId}:topic-caring` },
    update: {},
    create: {
      id: `${tenantId}:topic-caring`,
      tenantId: tenantId,
      name: 'Caring Service',
      description: 'Evaluating if staff treat people with kindness, compassion, dignity and respect.',
      domain: 'CQC',
      category: 'Key Question',
      version: 'v1',
      metadata: {
        regulations: ['Regulation 10: Dignity and respect'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  console.log(`Created topic: ${topicCaring.name}`);

  const topicResponsive = await prisma.topic.upsert({
    where: { id: `${tenantId}:topic-responsive` },
    update: {},
    create: {
      id: `${tenantId}:topic-responsive`,
      tenantId: tenantId,
      name: 'Responsive Service',
      description: 'Assessing if services meet people\'s needs.',
      domain: 'CQC',
      category: 'Key Question',
      version: 'v1',
      metadata: {
        regulations: ['Regulation 16: Receiving and acting on complaints'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  console.log(`Created topic: ${topicResponsive.name}`);

  const topicWellLed = await prisma.topic.upsert({
    where: { id: `${tenantId}:topic-well-led` },
    update: {},
    create: {
      id: `${tenantId}:topic-well-led`,
      tenantId: tenantId,
      name: 'Well-led Service',
      description: 'Evaluating if the leadership, management and governance of the organisation assures the delivery of high-quality care.',
      domain: 'CQC',
      category: 'Key Question',
      version: 'v1',
      metadata: {
        regulations: ['Regulation 17: Good governance', 'Regulation 18: Staffing'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  console.log(`Created topic: ${topicWellLed.name}`);

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });