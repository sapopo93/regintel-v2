export interface RateLimiter {
  schedule<T>(task: () => Promise<T>): Promise<T>;
}

export function createRateLimiter(minDelayMs: number): RateLimiter {
  let lastRun = 0;
  let queue = Promise.resolve();

  async function schedule<T>(task: () => Promise<T>): Promise<T> {
    queue = queue.then(async () => {
      const now = Date.now();
      const wait = Math.max(0, minDelayMs - (now - lastRun));
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      lastRun = Date.now();
      return task();
    });

    return queue as Promise<T>;
  }

  return { schedule };
}
