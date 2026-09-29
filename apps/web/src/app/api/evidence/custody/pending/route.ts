import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

/** Pending custody transfers awaiting current user confirmation. */
export async function GET() {
  const { error, session } = await requireAuth("evidence:read");
  if (error) return error;

  const pending = await prisma.custodyLog.findMany({
    where: {
      transferredToId: session!.user.id,
      transferStatus: "PENDING_RECIPIENT",
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      evidence: {
        select: { id: true, fileName: true, registerNumber: true, caseId: true },
      },
      user: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({ pending });
}
