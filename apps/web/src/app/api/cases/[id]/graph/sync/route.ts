import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { auditAccess } from "@/lib/audit-access";
import { syncFullCaseToNeo4j } from "@/lib/neo4j-sync";
import { scanAndCreateCrossCaseAlerts } from "@/lib/graph-analytics";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("graph:read");
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
    action: "SYNC",
    resource: "graph",
    resourceId: id,
  });

  try {
    const syncResult = await syncFullCaseToNeo4j(id);
    let alertsCreated = 0;
    try {
      alertsCreated = await scanAndCreateCrossCaseAlerts();
    } catch (scanErr) {
      console.warn("Cross-case scan during sync failed:", scanErr);
    }
    return NextResponse.json({ ...syncResult, alertsCreated });
  } catch (err) {
    console.error("Graph sync error:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
