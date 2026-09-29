import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { auditAccess } from "@/lib/audit-access";
import { analyzeFinancialForCase, createFinancialAlerts } from "@/lib/financial-intelligence";

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
    resource: "financial",
    resourceId: id,
  });

  const { searchParams } = new URL(request.url);
  const minAmount = parseFloat(searchParams.get("minAmount") ?? "0") || 0;
  const subgraphOnly = searchParams.get("subgraph") === "true";

  try {
    const analysis = await analyzeFinancialForCase(id, { minAmount });
    if (subgraphOnly) {
      return NextResponse.json({ subgraph: analysis.subgraph });
    }
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("Financial analysis error:", err);
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
    resource: "financial",
    resourceId: id,
  });

  try {
    const alertsCreated = await createFinancialAlerts(id);
    const analysis = await analyzeFinancialForCase(id);
    return NextResponse.json({ alertsCreated, analysis });
  } catch (err) {
    console.error("Financial alert creation error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
