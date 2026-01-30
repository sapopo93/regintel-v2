/**
 * Shared Test Utilities for Phase 8 Integration Tests
 *
 * Provides database helpers and tenant isolation utilities.
 */

import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

export const testDbUrl =
  process.env.TEST_DB_ADMIN_URL ||
  'postgres://postgres:postgres@localhost:5432/regintel_test';

export const testAppDbUrl =
  process.env.TEST_DB_APP_URL ||
  'postgres://regintel_app:regintel_app@localhost:5432/regintel_test';

/**
 * Generate a unique tenant ID for testing (UUID format)
 */
export function generateTenantId(): string {
  return randomUUID();
}

/**
 * Generate a unique resource ID for testing
 */
export function generateResourceId(prefix: string = 'resource'): string {
  return `${prefix}-${randomUUID()}`;
}

/**
 * Create ISO timestamp for testing
 */
export function createTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Wait for a specified duration (for async operations)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Assert that a value is defined (throws if not)
 */
export function assertDefined<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || 'Expected value to be defined');
  }
}

/**
 * Execute a database operation within a tenant context
 *
 * Sets app.tenant_id session variable to enforce Row-Level Security.
 * All queries within the callback will be scoped to the specified tenant.
 *
 * @param pool - Database connection pool
 * @param tenantId - Tenant UUID
 * @param fn - Callback function to execute with scoped client
 * @returns Result of callback function
 */
export async function withTenant<T>(
  pool: Pool,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL app.tenant_id = $1', [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clean up all data from test database
 * Use with caution - only call in test environments
 */
export async function cleanupTestDatabase(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('TRUNCATE audit_events CASCADE');
    await client.query('TRUNCATE evidence_records CASCADE');
    await client.query('TRUNCATE evidence_blobs CASCADE');
    await client.query('TRUNCATE findings CASCADE');
    await client.query('TRUNCATE draft_findings CASCADE');
    await client.query('TRUNCATE session_events CASCADE');
    await client.query('TRUNCATE mock_inspection_sessions CASCADE');
    await client.query('TRUNCATE provider_context_snapshots CASCADE');
  } finally {
    client.release();
  }
}
