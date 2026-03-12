import { describe, expect, it } from 'vitest';
import { isPublicPathname } from './public-routes';

describe('public routes', () => {
  it('keeps legal pages public', () => {
    expect(isPublicPathname('/terms')).toBe(true);
    expect(isPublicPathname('/privacy')).toBe(true);
  });

  it('keeps auth entry points public', () => {
    expect(isPublicPathname('/')).toBe(true);
    expect(isPublicPathname('/sign-in')).toBe(true);
    expect(isPublicPathname('/sign-in/factor-one')).toBe(true);
    expect(isPublicPathname('/sign-up')).toBe(true);
  });

  it('does not expose protected app routes', () => {
    expect(isPublicPathname('/providers')).toBe(false);
    expect(isPublicPathname('/dashboard')).toBe(false);
  });
});
