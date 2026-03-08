#!/usr/bin/env npx tsx
/**
 * Day 0 CQC API Spike — Mandatory Gating Script
 *
 * Verifies the CQC public API /changes endpoint behavior:
 * 1. Does GET /public/v1/changes?startTimestamp=... exist and return data?
 * 2. Does it support filtering by service type, or must we filter client-side?
 * 3. What's the pagination format (page/perPage? cursor?)?
 * 4. What fields are on each change record?
 *
 * Also tests the /public/v1/locations endpoint as a fallback.
 *
 * Run: npx tsx scripts/cqc-api-spike.ts
 */

const BASE_URL = 'https://api.service.cqc.org.uk';
const API_KEY = process.env.CQC_API_KEY;

const headers: Record<string, string> = { Accept: 'application/json' };
if (API_KEY) {
  headers['Ocp-Apim-Subscription-Key'] = API_KEY;
  console.log('[spike] Using CQC API key from CQC_API_KEY env var');
} else {
  console.log('[spike] No CQC_API_KEY set — using unauthenticated access (lower rate limits)');
}

async function probe(label: string, url: string): Promise<any> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${label}] GET ${url}`);
  console.log('='.repeat(60));

  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000),
    });

    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log(`Content-Type: ${res.headers.get('content-type')}`);

    // Log rate-limit headers if present
    for (const h of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'retry-after', 'ratelimit-limit', 'ratelimit-remaining']) {
      const val = res.headers.get(h);
      if (val) console.log(`${h}: ${val}`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '(no body)');
      console.log(`Error body: ${body.slice(0, 500)}`);
      return null;
    }

    const body = await res.json();

    // Print top-level keys
    console.log(`\nTop-level keys: ${Object.keys(body).join(', ')}`);

    // Print pagination fields if present
    for (const key of ['total', 'totalPages', 'total_pages', 'page', 'perPage', 'per_page', 'count', 'nextPageUri', 'next', 'cursor']) {
      if (body[key] !== undefined) {
        console.log(`  ${key}: ${JSON.stringify(body[key])}`);
      }
    }

    // Print first few items
    const items = body.changes ?? body.locations ?? body.results ?? body;
    if (Array.isArray(items)) {
      console.log(`\nArray length: ${items.length}`);
      if (items.length > 0) {
        console.log('\nFirst item keys:', Object.keys(items[0]).join(', '));
        console.log('First item:', JSON.stringify(items[0], null, 2));
        if (items.length > 1) {
          console.log('\nSecond item:', JSON.stringify(items[1], null, 2));
        }
      }
    } else {
      console.log('\nResponse (first 1000 chars):', JSON.stringify(body).slice(0, 1000));
    }

    return body;
  } catch (err: any) {
    console.log(`FAILED: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('CQC Public API Spike — Day 0 Gating Check');
  console.log(`Date: ${new Date().toISOString()}`);

  // 14 days ago as start date
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // --- Test 1: /public/v1/changes endpoint ---
  console.log('\n\n>>> TEST 1: /public/v1/changes endpoint');
  const changesResult = await probe(
    'changes',
    `${BASE_URL}/public/v1/changes?startTimestamp=${fourteenDaysAgo}&perPage=5&page=1`
  );

  // --- Test 2: /public/v1/changes with different timestamp format ---
  if (!changesResult) {
    console.log('\n\n>>> TEST 2: Trying ISO timestamp format');
    await probe(
      'changes-iso',
      `${BASE_URL}/public/v1/changes?startTimestamp=${fourteenDaysAgo}T00:00:00Z&perPage=5&page=1`
    );
  }

  // --- Test 3: /public/v1/changes with different param names ---
  if (!changesResult) {
    console.log('\n\n>>> TEST 3: Trying alternative param names');
    await probe(
      'changes-alt',
      `${BASE_URL}/public/v1/changes?start=${fourteenDaysAgo}&per_page=5&page=1`
    );
  }

  // --- Test 4: /public/v1/locations with service type filter ---
  console.log('\n\n>>> TEST 4: /public/v1/locations (fallback — search by service type)');
  await probe(
    'locations-search',
    `${BASE_URL}/public/v1/locations?careHome=Y&perPage=3&page=1`
  );

  // --- Test 5: /public/v1/locations plain ---
  console.log('\n\n>>> TEST 5: /public/v1/locations (plain, small page)');
  await probe(
    'locations-plain',
    `${BASE_URL}/public/v1/locations?perPage=3&page=1`
  );

  // --- Test 6: Single location detail (to verify report data availability) ---
  console.log('\n\n>>> TEST 6: /public/v1/locations/:id (single location detail)');
  // Use a well-known location ID (Sunrise Senior Living — large provider)
  const singleResult = await probe(
    'location-detail',
    `${BASE_URL}/public/v1/locations/1-113584427`
  );

  // --- Test 7: Location inspection areas (to check for ratings/findings) ---
  if (singleResult) {
    console.log('\n\n>>> TEST 7: /public/v1/locations/:id/inspection-areas');
    await probe(
      'inspection-areas',
      `${BASE_URL}/public/v1/locations/1-113584427/inspection-areas`
    );
  }

  // --- Summary ---
  console.log('\n\n' + '='.repeat(60));
  console.log('SPIKE SUMMARY');
  console.log('='.repeat(60));

  if (changesResult) {
    console.log('✓ /changes endpoint EXISTS and returns data');
    const items = changesResult.changes ?? changesResult.locations ?? changesResult.results ?? [];
    if (Array.isArray(items) && items.length > 0) {
      const first = items[0];
      console.log(`  Fields available: ${Object.keys(first).join(', ')}`);
      console.log(`  Has service type filter: ${first.type || first.serviceType ? 'client-side (field present on records)' : 'UNKNOWN'}`);
      console.log(`  Pagination: page/perPage format (totalPages: ${changesResult.totalPages ?? changesResult.total_pages ?? 'unknown'})`);
    }
  } else {
    console.log('✗ /changes endpoint NOT available or returned error');
    console.log('  → F1 architecture needs to use /locations polling fallback');
    console.log('  → cqc-changes-client.ts parseChangesResponse() handles this via flexible parsing');
  }

  console.log('\nDecision: The cqc-changes-client.ts already handles multiple response shapes.');
  console.log('If /changes is unavailable, the poll endpoint will return a graceful error');
  console.log('and can be adapted to use /locations search as a fallback.\n');
}

main().catch((err) => {
  console.error('Spike failed:', err);
  process.exit(1);
});
