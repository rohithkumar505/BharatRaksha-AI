import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const { error, session } = await requireAuth("evidence:read");
  if (error) return error;

  const { jobId, id: caseId } = await params;

  const job = await prisma.ingestionJob.findUnique({
    where: { id: jobId },
    include: { evidence: { select: { fileName: true, type: true, caseId: true } } },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseData || job.evidence.caseId !== caseId) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(job);
}
