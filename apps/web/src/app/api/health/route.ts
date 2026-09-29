import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";
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
  try {
    const pong = await getRedis().ping();
    checks.redis = {
      status: pong === "PONG" ? "healthy" : "unhealthy",
      latencyMs: Date.now() - redisStart,
    };
  } catch {
    checks.redis = { status: "unhealthy" };
  }

  const neoStart = Date.now();
  try {
    const driver = getNeo4jDriver();
    await driver.verifyConnectivity();
    checks.neo4j = { status: "healthy", latencyMs: Date.now() - neoStart };
  } catch {
    checks.neo4j = { status: "unhealthy" };
  }

  const s3Start = Date.now();
  try {
    const s3Endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
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

  const allHealthy = Object.values(checks).every((c) => c.status === "healthy");

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
