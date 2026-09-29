import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { auditAccess } from "@/lib/audit-access";
import { getUnifiedTimeline } from "@/lib/geo-intelligence";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("cases:read");
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
    resource: "timeline",
    resourceId: id,
  });

  try {
    const timeline = await getUnifiedTimeline(id);
    return NextResponse.json(timeline);
  } catch (err) {
    console.error("Timeline error:", err);
    return NextResponse.json({ error: "Timeline failed" }, { status: 500 });
  }
}
