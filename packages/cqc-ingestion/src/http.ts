import type { FetchLike, HttpClient } from './types';
import { createRateLimiter, type RateLimiter } from './rate-limit';

export interface HttpClientOptions {
  fetch?: FetchLike;
  rateLimitMs?: number;
  userAgent?: string;
}

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const fetchFn = options.fetch ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available. Provide a fetch implementation.');
  }

  const limiter: RateLimiter = createRateLimiter(options.rateLimitMs ?? 500); // <=2 req/sec
  const userAgent = options.userAgent ?? DEFAULT_UA;

  async function getText(url: string): Promise<string> {
    return limiter.schedule(async () => {
      const response = await fetchFn(url, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          'User-Agent': userAgent,
          'Accept-Language': 'en-GB,en;q=0.9',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      }
      return response.text();
    });
  }

  async function getBuffer(url: string): Promise<Buffer> {
    return limiter.schedule(async () => {
      const response = await fetchFn(url, {
        method: 'GET',
        headers: {
          Accept: '*/*',
          'User-Agent': userAgent,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    });
  }

  return { getText, getBuffer };
}
