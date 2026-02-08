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
    await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO regintel_app;');
    await client.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO regintel_app;');
  } finally {
    client.release();
  }
}

async function assertTablesExist(): Promise<void> {
  const client = await adminPool.connect();
  try {
    const tables = [
      'providers',
      'facilities',
      'provider_context_snapshots',
      'mock_inspection_sessions',
      'session_events',
      'draft_findings',
      'findings',
      'evidence_blobs',
      'evidence_records',
      'audit_events',
      'export_records',
      'background_jobs',
      'ai_insights',
      'regulations',
      'regulation_sections',
    ];

    for (const table of tables) {
      const result = await client.query(
        'SELECT to_regclass($1) as exists',
        [table]
      );
      if (!result.rows[0]?.exists) {
        throw new Error(`Missing table: ${table}. Run migrations first.`);
      }
    }
  } finally {
    client.release();
  }
}

async function resetDatabase(): Promise<void> {
  const client = await adminPool.connect();
  try {
    await client.query(`
      TRUNCATE
        ai_insights,
        background_jobs,
        export_records,
        evidence_records,
        evidence_blobs,
        findings,
        draft_findings,
        session_events,
        mock_inspection_sessions,
        provider_context_snapshots,
        facilities,
        providers,
        regulations,
        regulation_sections,
        audit_events
      CASCADE;
    `);
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

async function insertProvider(
  client: import('pg').PoolClient,
  tenantId: string,
  providerId: string
): Promise<void> {
  await client.query(
    `
    INSERT INTO providers (
      provider_id,
      tenant_id,
      provider_name,
      org_ref,
      as_of,
      prs_state,
      registered_beds,
      service_types,
      created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      providerId,
      tenantId,
      'Test Provider',
      'TEST-001',
      new Date().toISOString(),
      'ESTABLISHED',
      10,
      ['residential'],
      'test-user',
    ]
  );
}

async function insertFacility(
  client: import('pg').PoolClient,
  tenantId: string,
  providerId: string,
  facilityId: string
): Promise<void> {
  await client.query(
    `
    INSERT INTO facilities (
      facility_id,
      tenant_id,
      provider_id,
      facility_name,
      address_line1,
      town_city,
      postcode,
      address,
      cqc_location_id,
      service_type,
      capacity,
      facility_hash,
      created_by,
      as_of,
      data_source,
      inspection_status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    `,
    [
      facilityId,
      tenantId,
      providerId,
      'Test Facility',
      '1 Test Street',
      'Testville',
      'TE1 1ST',
      '1 Test Street, Testville, TE1 1ST',
      '1-TEST-LOC',
      'residential',
      20,
      `sha256:${randomUUID().replace(/-/g, '')}`,
      'test-user',
      new Date().toISOString(),
      'MANUAL',
      'PENDING_FIRST_INSPECTION',
    ]
  );
}

describe('integration:tenant-isolation-core', () => {
  beforeAll(async () => {
    await ensureRoleAndAccess();
    await assertTablesExist();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await appPool.end();
    await adminPool.end();
  });

  it('cross-tenant read returns empty for providers', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const providerA = `${tenantA}:provider-1`;

    await withTenant(tenantA, async (client) => {
      await insertProvider(client, tenantA, providerA);
    });

    await withTenant(tenantB, async (client) => {
      const result = await client.query('SELECT * FROM providers');
      expect(result.rows).toHaveLength(0);
    });

    await withTenant(tenantA, async (client) => {
      const result = await client.query('SELECT * FROM providers');
      expect(result.rows).toHaveLength(1);
    });
  });

  it('cross-tenant write is blocked on providers', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const providerB = `${tenantB}:provider-1`;

    await expect(
      withTenant(tenantA, async (client) => {
        await insertProvider(client, tenantB, providerB);
      })
    ).rejects.toThrow(/row-level|rls|policy|permission denied/i);
  });

  it('multiple tenants can reference the same blob', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();

    const providerA = `${tenantA}:provider-1`;
    const providerB = `${tenantB}:provider-1`;

    const facilityA = `${tenantA}:facility-1`;
    const facilityB = `${tenantB}:facility-1`;

    const contentHash = `sha256:${randomUUID().replace(/-/g, '')}`;

    const adminClient = await adminPool.connect();
    try {
      await adminClient.query(
        `
        INSERT INTO evidence_blobs (content_hash, content_type, size_bytes, storage_path)
        VALUES ($1, $2, $3, $4)
        `,
        [contentHash, 'application/pdf', 12345, `/tmp/${contentHash}`]
      );
    } finally {
      adminClient.release();
    }

    await withTenant(tenantA, async (client) => {
      await insertProvider(client, tenantA, providerA);
      await insertFacility(client, tenantA, providerA, facilityA);
      await client.query(
        `
        INSERT INTO evidence_records (
          id,
          tenant_id,
          provider_id,
          facility_id,
          content_hash,
          evidence_type,
          title,
          file_name,
          collected_at,
          created_by,
          mime_type,
          size_bytes,
          uploaded_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `,
        [
          `${tenantA}:evidence-1`,
          tenantA,
          providerA,
          facilityA,
          contentHash,
          'POLICY',
          'Policy A',
          'policy-a.pdf',
          new Date().toISOString(),
          'test-user',
          'application/pdf',
          12345,
          new Date().toISOString(),
        ]
      );
    });

    await withTenant(tenantB, async (client) => {
      await insertProvider(client, tenantB, providerB);
      await insertFacility(client, tenantB, providerB, facilityB);
      await client.query(
        `
        INSERT INTO evidence_records (
          id,
          tenant_id,
          provider_id,
          facility_id,
          content_hash,
          evidence_type,
          title,
          file_name,
          collected_at,
          created_by,
          mime_type,
          size_bytes,
          uploaded_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `,
        [
          `${tenantB}:evidence-1`,
          tenantB,
          providerB,
          facilityB,
          contentHash,
          'POLICY',
          'Policy B',
          'policy-b.pdf',
          new Date().toISOString(),
          'test-user',
          'application/pdf',
          12345,
          new Date().toISOString(),
        ]
      );

      const result = await client.query(
        'SELECT * FROM evidence_records WHERE tenant_id = $1',
        [tenantB]
      );
      expect(result.rows).toHaveLength(1);
    });

    await withTenant(tenantA, async (client) => {
      const result = await client.query(
        'SELECT * FROM evidence_records WHERE tenant_id = $1',
        [tenantA]
      );
      expect(result.rows).toHaveLength(1);
    });
  });
});
