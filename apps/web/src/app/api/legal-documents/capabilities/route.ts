import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { SIH26190_FEATURE_REGISTRY, SIH26190_REGISTRY_META, SIH26190_FEATURE_TIERS } from "@/lib/sih26190-feature-registry";
import { prisma } from "@/lib/db";

export async function GET() {
  const { error } = await requireAuth("cases:read");
  if (error) return error;

  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  return NextResponse.json({
    ...SIH26190_REGISTRY_META,
    platform: "Bharat Raksha AI",
    featureCount: SIH26190_FEATURE_REGISTRY.length,
    featureTiers: SIH26190_FEATURE_TIERS,
    features: SIH26190_FEATURE_REGISTRY,
    health: { database: dbOk, status: dbOk ? "operational" : "degraded" },
  });
}
