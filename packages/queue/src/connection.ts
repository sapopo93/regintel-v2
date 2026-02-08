/**
 * Redis Connection Factory
 *
 * Creates and manages Redis connections for BullMQ.
 * Supports connection pooling and health checks.
 */

import { Redis, type RedisOptions } from 'ioredis';

/**
 * Connection configuration from environment
 */
export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
}

/**
 * Parse REDIS_URL into RedisOptions
 */
function parseRedisUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    db: parsed.pathname ? parseInt(parsed.pathname.slice(1), 10) || 0 : 0,
  };
}

/**
 * Get Redis configuration from environment
 */
export function getRedisConfig(): RedisOptions {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    return {
      ...parseRedisUrl(redisUrl),
      maxRetriesPerRequest: null, // BullMQ requirement
      enableReadyCheck: false,
    };
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    maxRetriesPerRequest: null, // BullMQ requirement
    enableReadyCheck: false,
  };
}

/**
 * Connection pool for reusing Redis connections
 */
class ConnectionPool {
  private connections: Map<string, Redis> = new Map();

  /**
   * Get or create a connection with the given name
   */
  getConnection(name: string = 'default', config?: RedisOptions): Redis {
    const existing = this.connections.get(name);
    if (existing && existing.status === 'ready') {
      return existing;
    }

    const redis = new Redis({
      ...getRedisConfig(),
      ...config,
    });

    redis.on('error', (err) => {
      console.error(`[Redis:${name}] Connection error:`, err.message);
    });

    redis.on('connect', () => {
      console.log(`[Redis:${name}] Connected`);
    });

    redis.on('ready', () => {
      console.log(`[Redis:${name}] Ready`);
    });

    this.connections.set(name, redis);
    return redis;
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.connections.values()).map((conn) =>
      conn.quit().catch(() => {})
    );
    await Promise.all(closePromises);
    this.connections.clear();
  }

  /**
   * Health check - verify Redis is reachable
   */
  async healthCheck(name: string = 'default'): Promise<boolean> {
    const conn = this.connections.get(name);
    if (!conn) return false;

    try {
      const pong = await conn.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}

/**
 * Singleton connection pool
 */
export const connectionPool = new ConnectionPool();

/**
 * Create a new Redis connection for BullMQ queues
 */
export function createQueueConnection(name?: string): Redis {
  return connectionPool.getConnection(`queue:${name || 'default'}`);
}

/**
 * Create a new Redis connection for BullMQ workers
 */
export function createWorkerConnection(name?: string): Redis {
  return connectionPool.getConnection(`worker:${name || 'default'}`);
}

/**
 * Graceful shutdown helper
 */
export async function closeAllConnections(): Promise<void> {
  await connectionPool.closeAll();
}
