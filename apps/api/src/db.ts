/**
 * Prisma DB helpers
 *
 * Provides a tenant-scoped transaction wrapper to enforce RLS via app.tenant_id.
 */

import { PrismaClient, type Prisma } from '@prisma/client';

export const prisma = new PrismaClient();

/**
 * Set the tenant context for the current transaction.
 */
export async function setTenantContext(
  tx: Prisma.TransactionClient,
  tenantId: string
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
}

/**
 * Execute DB work within a tenant-scoped transaction.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await setTenantContext(tx, tenantId);
    return fn(tx);
  });
}
