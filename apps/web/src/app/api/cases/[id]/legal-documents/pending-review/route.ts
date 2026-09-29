import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { listPendingReviewDocuments } from "@/lib/legal-documents";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("reports:read");
  if (error) return error;

  const { id: caseId } = await params;
  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pending = await listPendingReviewDocuments(caseId);
  return NextResponse.json({ count: pending.length, documents: pending });
}
