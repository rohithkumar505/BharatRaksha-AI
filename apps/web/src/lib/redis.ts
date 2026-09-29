import Redis from "ioredis";

let redis: Redis | null = null;

/** True when Redis is explicitly configured (never default to localhost on Vercel). */
export function isRedisConfigured(): boolean {
  const url = process.env.REDIS_URL?.trim();
  const host = process.env.REDIS_HOST?.trim();
  return Boolean(url || host);
}

export function getRedis(): Redis {
  if (!isRedisConfigured()) {
    throw new Error("Redis is not configured (set REDIS_URL or REDIS_HOST)");
  }
  if (!redis) {
    const url = process.env.REDIS_URL?.trim();
    redis = url
      ? new Redis(url, {
          maxRetriesPerRequest: 1,
          connectTimeout: 3000,
          enableOfflineQueue: false,
          lazyConnect: true,
        })
      : new Redis({
          host: process.env.REDIS_HOST ?? "localhost",
          port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
          maxRetriesPerRequest: 1,
          connectTimeout: 3000,
          enableOfflineQueue: false,
          lazyConnect: true,
        });
  }
  return redis;
}
