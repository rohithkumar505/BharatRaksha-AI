import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { canAccessCase } from "@/lib/case-access";
import { createNoteSchema } from "@/lib/validators";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("cases:read");
  if (error) return error;

  const { id } = await params;
  const caseData = await prisma.case.findUnique({ where: { id } });
  if (!caseData) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const notes = await prisma.caseNote.findMany({
    where: { caseId: id },
    include: { author: { select: { name: true, role: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(notes);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth("cases:update");
  if (error) return error;

  const { id } = await params;
  const caseData = await prisma.case.findUnique({ where: { id } });
  if (!caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }
  if (!canAccessCase(session!.user, caseData)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const note = await prisma.caseNote.create({
    data: {
      caseId: id,
      authorId: session!.user.id,
      content: parsed.data.content,
    },
    include: { author: { select: { name: true, role: true } } },
  });

  await logAudit({
    userId: session!.user.id,
    action: "CREATE",
    resource: "case_note",
    resourceId: note.id,
    details: { caseId: id },
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json(note, { status: 201 });
}
