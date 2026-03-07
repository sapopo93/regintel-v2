import { execSync } from 'child_process';

export default async function globalSetup() {
  const dbUrl = process.env.DATABASE_URL
    || 'postgresql://postgres:postgres@localhost:5432/provereg_test';
  try {
    execSync(
      `psql "${dbUrl}" -c "TRUNCATE TABLE providers, facilities, provider_context_snapshots, mock_inspection_sessions, session_events, draft_findings, findings, evidence_records, evidence_blobs, audit_events CASCADE;"`,
      { stdio: 'pipe' }
    );
    console.log('[global-setup] Test database truncated.');
  } catch (err) {
    console.warn('[global-setup] Truncation failed (may be first run):', (err as Error).message);
  }
}
