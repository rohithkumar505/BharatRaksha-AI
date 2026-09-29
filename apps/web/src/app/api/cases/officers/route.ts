import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

/** List investigators assignable to cases (same station for senior officers) */
export async function GET() {
  const { error, session } = await requireAuth("cases:read");
  if (error) return error;

  const where =
    session!.user.role === "SENIOR_OFFICER" && session!.user.policeStation
      ? {
          isActive: true,
          role: { in: ["INVESTIGATOR" as const, "SENIOR_OFFICER" as const] },
          policeStation: session!.user.policeStation,
        }
      : {
          isActive: true,
          role: { in: ["INVESTIGATOR" as const, "SENIOR_OFFICER" as const] },
        };

  const officers = await prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, role: true, policeStation: true, badgeNumber: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(officers);
}
