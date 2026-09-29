import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const { error, session } = await requireAuth("alerts:read");
  if (error) return error;

  await logAudit({
    userId: session!.user.id,
    action: "READ",
    resource: "alerts",
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  const { searchParams } = new URL(request.url);
  const caseId = searchParams.get("caseId");
  const status = searchParams.get("status");

  const alerts = await prisma.alert.findMany({
    where: {
      ...(caseId ? { caseId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    include: {
      case: { select: { id: true, caseNumber: true } },
      entity: { select: { normalizedValue: true, type: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(alerts);
}

export async function PATCH(request: NextRequest) {
  const { error, session } = await requireAuth("alerts:manage");
  if (error) return error;

  const { id, status } = await request.json();
  const updated = await prisma.alert.update({
    where: { id },
    data: { status },
  });

  await logAudit({
    userId: session!.user.id,
    action: "UPDATE",
    resource: "alert",
    resourceId: id,
    details: { status },
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json(updated);
}
