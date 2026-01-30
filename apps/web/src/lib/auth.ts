/**
 * Authentication Library
 *
 * Supports both Clerk (production) and legacy demo tokens (migration period).
 */

// Re-export Clerk hooks for production use
export { useAuth, useUser } from '@clerk/nextjs';

export const AUTH_TOKEN_KEY = 'regintel.auth.token';
export const AUTH_ROLE_KEY = 'regintel.auth.role';

export type AuthRole = 'FOUNDER' | 'PROVIDER';

// DEPRECATED: Legacy demo token functions
// These will be removed after Clerk migration is complete

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getAuthRole(): AuthRole | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(AUTH_ROLE_KEY) as AuthRole | null;
}

export function setAuthToken(token: string, role: AuthRole): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  window.localStorage.setItem(AUTH_ROLE_KEY, role);
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_ROLE_KEY);
}
