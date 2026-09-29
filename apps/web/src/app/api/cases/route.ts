import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { logAudit, getClientIp, getUserAgent } from "@/lib/audit";
import { caseAccessFilter } from "@/lib/case-access";
import { createCaseSchema } from "@/lib/validators";
import { checkRateLimit } from "@/lib/rate-limit";
import { Prisma } from "@bharat-raksha/database";

export async function GET(request: NextRequest) {
  const { error, session } = await requireAuth("cases:read");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const search = searchParams.get("search");
  const officerId = searchParams.get("officerId");
  const policeStation = searchParams.get("policeStation");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));
  const skip = (page - 1) * limit;

  const accessFilter = caseAccessFilter(session!.user);

  const where: Prisma.CaseWhereInput = {
    ...accessFilter,
    ...(status ? { status: status as never } : {}),
    ...(priority ? { priority: priority as never } : {}),
    ...(officerId ? { investigatingOfficerId: officerId } : {}),
    ...(policeStation ? { policeStation } : {}),
    ...(search
      ? {
          OR: [
            { caseNumber: { contains: search, mode: "insensitive" } },
            { crimeType: { contains: search, mode: "insensitive" } },
            { location: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [cases, total] = await Promise.all([
    prisma.case.findMany({
      where,
      include: {
        investigatingOfficer: { select: { id: true, name: true, email: true } },
        _count: { select: { evidence: true, entities: true, alerts: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.case.count({ where }),
  ]);

  await logAudit({
    userId: session!.user.id,
    action: "LIST",
    resource: "cases",
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json({ cases, total, page, limit });
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth("cases:create");
  if (error) return error;

  const rateLimit = await checkRateLimit(`cases:create:${session!.user.id}`, 100, 3600);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await request.json();
  const parsed = createCaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { crimeType, location, incidentDate, priority, description, policeStation } =
    parsed.data;

  const year = new Date().getFullYear();
  const prefix = `CASE-${year}-`;

  const existingCases = await prisma.case.findMany({
    where: { caseNumber: { startsWith: prefix } },
    select: { caseNumber: true },
  });

  let maxSeq = 0;
  const seqPattern = new RegExp(`^CASE-${year}-(\\d{5})$`);
  for (const c of existingCases) {
    const match = c.caseNumber.match(seqPattern);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }

  let newCase;
  for (let attempt = 0; attempt < 5; attempt++) {
    const caseNumber = `${prefix}${String(maxSeq + 1 + attempt).padStart(5, "0")}`;

    try {
      newCase = await prisma.case.create({
        data: {
          caseNumber,
          crimeType,
          location,
          incidentDate: incidentDate ? new Date(incidentDate) : undefined,
          priority: priority ?? "MEDIUM",
          description,
          policeStation: policeStation ?? session!.user.policeStation,
          investigatingOfficerId: session!.user.id,
          status: "OPEN",
        },
        include: {
          investigatingOfficer: { select: { id: true, name: true } },
        },
      });
      break;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        attempt < 4
      ) {
        continue;
      }
      throw err;
    }
  }

  if (!newCase) {
    return NextResponse.json({ error: "Failed to generate unique case number" }, { status: 500 });
  }

  await logAudit({
    userId: session!.user.id,
    action: "CREATE",
    resource: "case",
    resourceId: newCase.id,
    details: { caseNumber: newCase.caseNumber },
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return NextResponse.json(newCase, { status: 201 });
}
