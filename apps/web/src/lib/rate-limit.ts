import { NextRequest, NextResponse } from "next/server";
import { getRedis, isRedisConfigured } from "./redis";
import { getClientIp } from "./audit";

const RATE_LIMIT_PREFIX = "ratelimit:";

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  if (!isRedisConfigured()) {
    return { allowed: true, remaining: limit };
  }
  try {
    const redis = getRedis();
    await redis.connect().catch(() => {
      /* already connected */
    });
    const redisKey = `${RATE_LIMIT_PREFIX}${key}`;
    const current = await redis.incr(redisKey);
    if (current === 1) {
      await redis.expire(redisKey, windowSeconds);
    }
    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
    };
  } catch {
    return { allowed: true, remaining: limit };
  }
}

export async function rateLimit(
  request: NextRequest,
  scope: string,
  limit: number,
  windowSeconds: number
): Promise<NextResponse | null> {
  const ip = getClientIp(request) ?? "unknown";
  const { allowed } = await checkRateLimit(`${scope}:${ip}`, limit, windowSeconds);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  return null;
}
