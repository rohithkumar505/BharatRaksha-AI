import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { getNeo4jDriver } from "@/lib/neo4j";

export async function GET() {
  const checks: Record<string, { status: string; latencyMs?: number }> = {};

  const pgStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = { status: "healthy", latencyMs: Date.now() - pgStart };
  } catch {
    checks.postgres = { status: "unhealthy" };
  }

  const redisStart = Date.now();
  if (isRedisConfigured()) {
    try {
      const redis = getRedis();
      await redis.connect().catch(() => {});
      const pong = await Promise.race([
        redis.ping(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("redis timeout")), 3000)
        ),
      ]);
      checks.redis = {
        status: pong === "PONG" ? "healthy" : "unhealthy",
        latencyMs: Date.now() - redisStart,
      };
    } catch {
      checks.redis = { status: "unhealthy" };
    }
  } else {
    checks.redis = { status: "skipped" };
  }

  const neoUri = process.env.NEO4J_URI?.trim();
  if (neoUri) {
    const neoStart = Date.now();
    try {
      const driver = getNeo4jDriver();
      await Promise.race([
        driver.verifyConnectivity(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("neo4j timeout")), 3000)
        ),
      ]);
      checks.neo4j = { status: "healthy", latencyMs: Date.now() - neoStart };
    } catch {
      checks.neo4j = { status: "unhealthy" };
    }
  } else {
    checks.neo4j = { status: "skipped" };
  }

  const s3Endpoint = process.env.S3_ENDPOINT?.trim();
  if (s3Endpoint) {
    const s3Start = Date.now();
    try {
      const res = await fetch(`${s3Endpoint}/minio/health/live`, {
        signal: AbortSignal.timeout(3000),
      });
      checks.minio = {
        status: res.ok ? "healthy" : "unhealthy",
        latencyMs: Date.now() - s3Start,
      };
    } catch {
      checks.minio = { status: "unhealthy" };
    }
  } else {
    checks.minio = { status: "skipped" };
  }

  const allHealthy = Object.values(checks).every(
    (c) => c.status === "healthy" || c.status === "skipped"
  );

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "degraded",
      service: "bharat-raksha-ai",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allHealthy ? 200 : 503 }
  );
}
