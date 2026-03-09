export function reportError(error: unknown, context?: Record<string, string>) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[RegIntel Error]', message, context ?? {});
  // Future: wire to Sentry, LogRocket, etc.
}
