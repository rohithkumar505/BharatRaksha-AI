import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { logAudit, getClientIp } from "@/lib/audit";
import { mergeEntities } from "@/lib/entity-merge";

export async function GET(request: NextRequest) {
  const { error } = await requireAuth("entities:read");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const caseId = searchParams.get("caseId");
  const status = searchParams.get("status") ?? "PENDING";

  const matches = await prisma.entityMatch.findMany({
    where: {
      status: status as never,
      ...(caseId ? { entityA: { caseId } } : {}),
    },
    include: {
      entityA: {
        select: {
          id: true,
          type: true,
          normalizedValue: true,
          caseId: true,
          evidenceId: true,
          rawValues: true,
          evidence: { select: { id: true, fileName: true, type: true } },
        },
      },
      entityB: {
        select: {
          id: true,
          type: true,
          normalizedValue: true,
          caseId: true,
          evidenceId: true,
          rawValues: true,
          evidence: { select: { id: true, fileName: true, type: true } },
        },
      },
      reviewedBy: { select: { name: true, email: true } },
    },
    orderBy: { confidence: "desc" },
    take: 100,
  });

  return NextResponse.json(matches);
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth("entities:review");
  if (error) return error;

  const { matchId, action } = await request.json();

  const match = await prisma.entityMatch.findUnique({
    where: { id: matchId },
    include: { entityA: true, entityB: true },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (action === "approve") {
    await mergeEntities(match.entityAId, match.entityBId);

    await prisma.entityMatch.update({
      where: { id: matchId },
      data: {
        status: "APPROVED",
        reviewedById: session!.user.id,
        reviewedAt: new Date(),
      },
    });
  } else if (action === "reject") {
    await prisma.entityMatch.update({
      where: { id: matchId },
      data: {
        status: "REJECTED",
        reviewedById: session!.user.id,
        reviewedAt: new Date(),
      },
    });
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  await logAudit({
    userId: session!.user.id,
    action: action === "approve" ? "APPROVE_MATCH" : "REJECT_MATCH",
    resource: "entity_match",
    resourceId: matchId,
    details: {
      entityAId: match.entityAId,
      entityBId: match.entityBId,
      canonicalId: action === "approve" ? match.entityAId : undefined,
    },
    ipAddress: getClientIp(request),
  });

  return NextResponse.json({ success: true, canonicalId: match.entityAId });
}
