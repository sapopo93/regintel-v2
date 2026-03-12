const PUBLIC_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/sign-in(?:\/.*)?$/,
  /^\/sign-up(?:\/.*)?$/,
  /^\/terms$/,
  /^\/privacy$/,
  /^\/api\/webhooks(?:\/.*)?$/,
] as const;

export const PUBLIC_ROUTE_MATCHERS = [
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/terms',
  '/privacy',
  '/api/webhooks(.*)',
] as const;

export function isPublicPathname(pathname: string): boolean {
  return PUBLIC_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}
