import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { SIDEBAR_NAVIGATION } from '../apps/web/src/lib/constants';

type FeatureMap = {
  routes: Array<{
    route: string;
    status: string;
    endpoints: string[];
  }>;
  clientEndpoints: string[];
};

const ROOT = process.cwd();
const APP_DIR = join(ROOT, 'apps', 'web', 'src', 'app');
const CLIENT_PATH = join(ROOT, 'apps', 'web', 'src', 'lib', 'api', 'client.ts');
const FEATURE_MAP_PATH = join(ROOT, 'docs', 'FEATURE_MAP.md');

function listRoutes(dir: string, baseDir = dir): string[] {
  const entries = readdirSync(dir);
  const routes: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      routes.push(...listRoutes(fullPath, baseDir));
      continue;
    }

    if (!/^page\.(tsx|ts|jsx|js)$/.test(entry)) {
      continue;
    }

    const relativeDir = posix.normalize(fullPath.replace(baseDir, '').replace(/\\/g, '/'));
    const withoutPage = relativeDir.replace(/\/page\.(tsx|ts|jsx|js)$/, '');
    const routePath = withoutPage === '' ? '/' : withoutPage;
    routes.push(routePath);
  }

  return routes;
}

function extractFeatureMap(): FeatureMap {
  const content = readFileSync(FEATURE_MAP_PATH, 'utf-8');
  const match = content.match(/<!-- feature-map:begin -->[\s\S]*?```json\s*([\s\S]*?)\s*```[\s\S]*?<!-- feature-map:end -->/);
  if (!match) {
    throw new Error('FEATURE_MAP.md is missing the feature-map JSON block.');
  }
  return JSON.parse(match[1]) as FeatureMap;
}

function normalizeEndpoint(endpoint: string): string {
  let normalized = endpoint;

  normalized = normalized.replace(/\$\{providerId\}/g, ':providerId');
  normalized = normalized.replace(/\$\{facilityId\}/g, ':facilityId');
  normalized = normalized.replace(/\$\{sessionId\}/g, ':sessionId');
  normalized = normalized.replace(/\$\{findingId\}/g, ':findingId');
  normalized = normalized.replace(/\$\{topicId\}/g, ':topicId');
  normalized = normalized.replace(/\$\{jobId\}/g, ':jobId');
  normalized = normalized.replace(/\$\{blobHash\}/g, ':blobHash');
  normalized = normalized.replace(/\$\{request\.facilityId\}/g, ':facilityId');
  normalized = normalized.replace(/\$\{request\.providerId\}/g, ':providerId');
  normalized = normalized.replace(/\$\{query\}/g, '?facility=:facilityId');

  return normalized;
}

function extractClientEndpoints(): string[] {
  const content = readFileSync(CLIENT_PATH, 'utf-8');
  const pattern = /`([^`\n]*\/v1[^`\n]*)`|'([^'\n]*\/v1[^'\n]*)'|"([^"\n]*\/v1[^"\n]*)"/g;
  const matches = [...content.matchAll(pattern)];
  const endpoints = matches.map((match) => match[1] || match[2] || match[3]).filter(Boolean);
  return Array.from(new Set(endpoints.map(normalizeEndpoint)));
}

function normalizeRoute(route: string): string {
  // Strip route groups like (app), (public), etc. from filesystem routes
  // Next.js route groups don't appear in URLs, so we normalize them away
  const withoutQueryParams = route.split('?')[0];
  return withoutQueryParams.replace(/\/\([^)]+\)/g, '');
}

describe('feature map', () => {
  it('documents all routes and client endpoints', () => {
    const featureMap = extractFeatureMap();
    const docRoutes = featureMap.routes.map((entry) => normalizeRoute(entry.route));
    const actualRoutes = listRoutes(APP_DIR).map(normalizeRoute);
    const navRoutes = SIDEBAR_NAVIGATION.map((item) => item.href);

    const missingRoutes = actualRoutes.filter((route) => !docRoutes.includes(route));
    const extraRoutes = docRoutes.filter((route) => !actualRoutes.includes(route));
    const missingNavRoutes = navRoutes.filter((route) => !docRoutes.includes(route));

    expect(missingRoutes, `Missing routes: ${missingRoutes.join(', ')}`).toHaveLength(0);
    expect(extraRoutes, `Extra routes: ${extraRoutes.join(', ')}`).toHaveLength(0);
    expect(missingNavRoutes, `Missing nav routes: ${missingNavRoutes.join(', ')}`).toHaveLength(0);

    const clientEndpoints = Array.from(
      new Set(extractClientEndpoints().map((e) => e.split('?')[0]))
    );
    const docEndpointPaths = Array.from(
      new Set(featureMap.clientEndpoints.map((e) => e.replace(/^(GET|POST|PUT|DELETE|PATCH)\s+/, '').split('?')[0]))
    );
    const missingEndpoints = clientEndpoints.filter((endpoint) => !docEndpointPaths.includes(endpoint));
    const extraEndpoints = docEndpointPaths.filter((endpoint) => !clientEndpoints.includes(endpoint));

    expect(missingEndpoints, `Missing endpoints: ${missingEndpoints.join(', ')}`).toHaveLength(0);
    expect(extraEndpoints, `Extra endpoints: ${extraEndpoints.join(', ')}`).toHaveLength(0);
  });
});
