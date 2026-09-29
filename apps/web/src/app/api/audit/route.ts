import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { error } = await requireAuth("audit:read");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const resource = searchParams.get("resource");
  const action = searchParams.get("action");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(resource ? { resource } : {}),
        ...(action ? { action } : {}),
      },
      include: {
        user: { select: { name: true, email: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({
      where: {
        ...(userId ? { userId } : {}),
        ...(resource ? { resource } : {}),
        ...(action ? { action } : {}),
      },
    }),
  ]);

  return NextResponse.json({ logs, total, limit, offset });
}
