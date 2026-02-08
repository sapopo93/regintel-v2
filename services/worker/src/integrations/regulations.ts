/**
 * Regulation loader for validation.
 *
 * Loads valid regulation references for a tenant from the database.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: Set<string>; fetchedAt: number }>();

function normalizeRegulation(input: string): string {
  return input
    .replace(/regulation/gi, 'Reg')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function loadValidRegulations(tenantId: string): Promise<Set<string>> {
  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const sections = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return tx.regulationSection.findMany({
        where: { tenantId },
        select: { sectionId: true },
      });
    });

    const valid = new Set(sections.map((section) => normalizeRegulation(section.sectionId)));
    cache.set(tenantId, { data: valid, fetchedAt: Date.now() });
    return valid;
  } catch (error) {
    console.warn('[Regulations] Failed to load valid regulations. Using fallback list.', error);
    return new Set();
  }
}
