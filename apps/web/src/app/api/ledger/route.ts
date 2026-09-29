import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { verifyGlobalLedgerChain } from "@/lib/blockchain";

export async function GET(request: NextRequest) {
  const { error } = await requireAuth("audit:read");
  if (error) {
    const readOnly = await requireAuth("evidence:read");
    if (readOnly.error) return readOnly.error;
  }

  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10), 200);
  const { prisma } = await import("@/lib/db");

  const blocks = await prisma.ledgerBlock.findMany({
    orderBy: { blockIndex: "desc" },
    take: limit,
    include: {
      user: { select: { name: true, email: true } },
      evidence: { select: { fileName: true, caseId: true } },
    },
  });

  const verification = await verifyGlobalLedgerChain();

  return NextResponse.json({
    verification,
    blocks: blocks.reverse(),
  });
}
