import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

const adminUrl =
  process.env.TEST_DB_ADMIN_URL ||
  'postgres://postgres:postgres@localhost:5432/regintel_test';
const appUrl =
  process.env.TEST_DB_APP_URL ||
  'postgres://regintel_app:regintel_app@localhost:5432/regintel_test';

const adminPool = new Pool({ connectionString: adminUrl });
const appPool = new Pool({ connectionString: appUrl });

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function getDatabaseName(urlString: string): string {
  const dbName = new URL(urlString).pathname.replace(/^\//, '');
  return dbName || 'postgres';
}

async function ensureRoleAndAccess(): Promise<void> {
  const client = await adminPool.connect();
  try {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'regintel_app') THEN
          CREATE ROLE regintel_app LOGIN PASSWORD 'regintel_app';
        END IF;
      END
      $$;
    `);

    const dbName = quoteIdent(getDatabaseName(adminUrl));
    await client.query(`GRANT CONNECT ON DATABASE ${dbName} TO regintel_app;`);
    await client.query('GRANT USAGE, CREATE ON SCHEMA public TO regintel_app;');
  } finally {
    client.release();
  }
}

async function resetDatabase(): Promise<void> {
  const client = await adminPool.connect();
  try {
    await client.query('DROP TABLE IF EXISTS tenant_isolation_test;');
    await client.query(`
      CREATE TABLE tenant_isolation_test (
        id uuid PRIMARY KEY,
        tenant_id text NOT NULL,
        payload text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await client.query('ALTER TABLE tenant_isolation_test ENABLE ROW LEVEL SECURITY;');
    await client.query('ALTER TABLE tenant_isolation_test FORCE ROW LEVEL SECURITY;');
    await client.query(`
      CREATE POLICY tenant_isolation_policy ON tenant_isolation_test
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
    `);
    await client.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_isolation_test TO regintel_app;'
    );
  } finally {
    client.release();
  }
}

async function withTenant<T>(
  tenantId: string,
  fn: (client: import('pg').PoolClient) => Promise<T>
): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config(\'app.tenant_id\', $1, true)', [tenantId]);
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

async function insertRow(client: import('pg').PoolClient, tenantId: string): Promise<string> {
  const id = randomUUID();
  await client.query(
    'INSERT INTO tenant_isolation_test (id, tenant_id, payload) VALUES ($1, $2, $3)',
    [id, tenantId, `payload-${tenantId}`]
  );
  return id;
}

describe('integration:tenant-isolation', () => {
  beforeAll(async () => {
    await ensureRoleAndAccess();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await appPool.end();
    await adminPool.end();
  });

  it('cross-tenant read returns empty', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();

    await withTenant(tenantA, async (client) => {
      await insertRow(client, tenantA);
    });

    await withTenant(tenantB, async (client) => {
      const result = await client.query('SELECT * FROM tenant_isolation_test;');
      expect(result.rows).toHaveLength(0);
    });

    await withTenant(tenantA, async (client) => {
      const result = await client.query('SELECT * FROM tenant_isolation_test;');
      expect(result.rows).toHaveLength(1);
    });
  });

  it('cross-tenant write is blocked by RLS', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();

    await expect(
      withTenant(tenantA, async (client) => {
        await insertRow(client, tenantB);
      })
    ).rejects.toThrow(/row-level|rls|policy/i);
  });
});
