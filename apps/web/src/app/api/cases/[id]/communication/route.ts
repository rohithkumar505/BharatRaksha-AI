import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { auditAccess } from "@/lib/audit-access";
import { analyzeCdrForCase, createCdrAlerts } from "@/lib/cdr-intelligence";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("analytics:read");
  if (error) return error;

  const { id } = await params;
  const caseData = await prisma.case.findUnique({ where: { id } });
  if (!caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await auditAccess(request, {
    userId: session!.user.id,
    action: "READ",
    resource: "communication",
    resourceId: id,
  });

  const { searchParams } = new URL(request.url);
  const subgraphOnly = searchParams.get("subgraph") === "true";

  try {
    const analysis = await analyzeCdrForCase(id);
    if (subgraphOnly) {
      return NextResponse.json({ subgraph: analysis.subgraph });
    }
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("CDR analysis error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("analytics:read");
  if (error) return error;

  const { id } = await params;
  const caseData = await prisma.case.findUnique({ where: { id } });
  if (!caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await auditAccess(request, {
    userId: session!.user.id,
    action: "ANALYZE",
    resource: "communication",
    resourceId: id,
  });

  try {
    const alertsCreated = await createCdrAlerts(id);
    const analysis = await analyzeCdrForCase(id);
    return NextResponse.json({ alertsCreated, analysis });
  } catch (err) {
    console.error("CDR alert creation error:", err);
    return NextResponse.json({ error: "Alert creation failed" }, { status: 500 });
  }
}
