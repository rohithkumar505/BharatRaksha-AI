import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { auditAccess } from "@/lib/audit-access";
import { whatIfRemoveNode } from "@/lib/graph-analytics";

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

  const { nodeId } = await request.json();
  if (!nodeId) {
    return NextResponse.json({ error: "nodeId required" }, { status: 400 });
  }

  await auditAccess(request, {
    userId: session!.user.id,
    action: "WHAT_IF",
    resource: "graph",
    resourceId: id,
    details: { nodeId },
  });

  try {
    const result = await whatIfRemoveNode(id, nodeId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("What-if error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
