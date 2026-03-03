/**
 * Lazy singleton Redis client for dev-health-web.
 *
 * Connects to `process.env.REDIS_URL` when available, returns `null` otherwise.
 * Uses `lazyConnect` so no connection attempt happens until the first command.
 *
 * Usage:
 *   import { getRedis } from "@/lib/redis";
 *   const redis = getRedis();
 *   if (redis) { await redis.get("key"); }
 */

import { logger } from "@/lib/logger";

type RedisClient = import("ioredis").default;

let _client: RedisClient | null | undefined;

/**
 * Returns a shared Redis client, or `null` when `REDIS_URL` is not configured.
 *
 * The client is created once (lazy singleton). On connection errors the client
 * logs and continues — callers should treat a `null` return or caught errors
 * as "Redis unavailable" and fall back gracefully.
 */
export function getRedis(): RedisClient | null {
  if (_client !== undefined) return _client;

  const url = process.env.REDIS_URL;
  if (!url) {
    _client = null;
    return null;
  }

  try {
    // Dynamic import so the ioredis module is only loaded when REDIS_URL is set.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require("ioredis").default ?? require("ioredis");

    const client: RedisClient = new Redis(url, {
      lazyConnect: true,
      connectTimeout: 5_000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    client.on("error", (err: Error) => {
      logger.error({ err }, "Redis connection error");
    });

    _client = client;
    logger.info("Redis client initialised (lazy connect)");
    return client;
  } catch (err) {
    logger.error({ err }, "Failed to create Redis client — falling back to in-memory");
    _client = null;
    return null;
  }
}

/**
 * Reset the singleton (for testing only).
 * @internal
 */
export function _resetRedisClient(): void {
  if (_client) {
    _client.disconnect();
  }
  _client = undefined;
}
