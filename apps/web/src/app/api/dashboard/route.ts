import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { auditAccess } from "@/lib/audit-access";
import { caseAccessFilter } from "@/lib/case-access";
import { aggregateLegalDocumentStats } from "@/lib/legal-documents";
import { Prisma } from "@bharat-raksha/database";

export async function GET(request: NextRequest) {
  const { error, session } = await requireAuth("cases:read");
  if (error) return error;

  await auditAccess(request, {
    userId: session!.user.id,
    action: "READ",
    resource: "dashboard",
  });

  const accessFilter = caseAccessFilter(session!.user);
  const caseWhere: Prisma.CaseWhereInput = accessFilter;

  const accessibleCaseIds = await prisma.case.findMany({
    where: caseWhere,
    select: { id: true },
  });
  const caseIds = accessibleCaseIds.map((c) => c.id);

  const entityWhere: Prisma.EntityWhereInput = {
    mergedIntoId: null,
    ...(caseIds.length > 0 ? { caseId: { in: caseIds } } : { caseId: "__none__" }),
  };

  const [
    activeCases,
    highPriority,
    personsOfInterest,
    suspiciousTransactions,
    newAlerts,
    totalEntities,
    totalRelationships,
    connectedNetworks,
  ] = await Promise.all([
    prisma.case.count({
      where: { ...caseWhere, status: { in: ["OPEN", "UNDER_INVESTIGATION"] } },
    }),
    prisma.case.count({
      where: { ...caseWhere, priority: { in: ["HIGH", "CRITICAL"] } },
    }),
    prisma.entity.count({
      where: { ...entityWhere, type: "PERSON" },
    }),
    caseIds.length > 0
      ? prisma.transaction.count({
          where: { caseId: { in: caseIds }, amount: { gte: 100000 } },
        })
      : Promise.resolve(0),
    caseIds.length > 0
      ? prisma.alert.count({ where: { caseId: { in: caseIds }, status: "NEW" } })
      : Promise.resolve(0),
    prisma.entity.count({ where: entityWhere }),
    caseIds.length > 0
      ? prisma.relationship.count({
          where: { sourceEntity: { caseId: { in: caseIds } } },
        })
      : Promise.resolve(0),
    prisma.case.count({
      where: { ...caseWhere, entities: { some: {} } },
    }),
  ]);

  const recentAlerts =
    caseIds.length > 0
      ? await prisma.alert.findMany({
          where: { caseId: { in: caseIds }, status: "NEW" },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { case: { select: { id: true, caseNumber: true } } },
        })
      : [];

  const recentCases = await prisma.case.findMany({
    where: caseWhere,
    orderBy: { updatedAt: "desc" },
    take: 5,
    include: {
      investigatingOfficer: { select: { name: true } },
      _count: { select: { entities: true, alerts: true } },
    },
  });

  const legalDocuments = await aggregateLegalDocumentStats(caseIds);

  return NextResponse.json({
    stats: {
      activeCases,
      highPriority,
      personsOfInterest,
      suspiciousTransactions,
      newAlerts,
      totalEntities,
      totalRelationships,
      connectedNetworks,
      legalDocuments,
    },
    recentAlerts,
    recentCases,
  });
}
