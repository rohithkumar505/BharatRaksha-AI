import { prisma } from "./db";
import { getFullGraphAnalytics } from "./graph-analytics";
import { getUnifiedTimeline } from "./geo-intelligence";
import { analyzeFinancialForCase } from "./financial-intelligence";
import { analyzeCdrForCase } from "./cdr-intelligence";

export interface ReportSection {
  id: string;
  title: string;
  content: string | Record<string, unknown> | unknown[];
}

export interface InvestigationReport {
  meta: {
    caseId: string;
    caseNumber: string;
    crimeType: string;
    status: string;
    priority: string;
    location: string | null;
    generatedAt: string;
    generatedBy: string;
    classification: string;
  };
  sections: ReportSection[];
  sources: Array<{
    type: string;
    ref: string;
    fileName?: string;
    hash?: string;
    confidence?: number;
  }>;
  summary: {
    entityCount: number;
    evidenceCount: number;
    alertCount: number;
    cdrCount: number;
    transactionCount: number;
  };
}

export async function generateInvestigationReport(
  caseId: string,
  userId: string
): Promise<InvestigationReport> {
  const [caseData, user, evidence, alerts, entities] = await Promise.all([
    prisma.case.findUnique({
      where: { id: caseId },
      include: {
        _count: {
          select: {
            entities: true,
            evidence: true,
            alerts: true,
            cdrRecords: true,
            transactions: true,
          },
        },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    prisma.evidence.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        fileName: true,
        type: true,
        sha256Hash: true,
        ingestionStatus: true,
        createdAt: true,
      },
    }),
    prisma.alert.findMany({
      where: { caseId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.entity.findMany({
      where: { caseId, mergedIntoId: null },
      orderBy: { confidence: "desc" },
      take: 30,
    }),
  ]);

  if (!caseData) throw new Error("Case not found");

  const sections: ReportSection[] = [];

  sections.push({
    id: "summary",
    title: "Executive Summary",
    content: {
      caseNumber: caseData.caseNumber,
      crimeType: caseData.crimeType,
      status: caseData.status,
      priority: caseData.priority,
      location: caseData.location,
      description: caseData.description,
      counts: caseData._count,
      disclaimer:
        "This report contains investigative leads derived from ingested evidence. Review recommended — not proof of criminality.",
    },
  });

  try {
    const analytics = await getFullGraphAnalytics(caseId);
    sections.push({
      id: "network",
      title: "Network Analysis",
      content: {
        topConnected: analytics.topByDegree?.slice(0, 10),
        bridgeNodes: analytics.bridges?.slice(0, 8),
        communities: analytics.communities?.slice(0, 5),
        intelligenceScores: analytics.intelligence?.slice(0, 10),
      },
    });
  } catch {
    sections.push({
      id: "network",
      title: "Network Analysis",
      content: "Graph analytics unavailable. Sync graph from Network tab.",
    });
  }

  try {
    const timeline = await getUnifiedTimeline(caseId);
    sections.push({
      id: "timeline",
      title: "Unified Timeline",
      content: {
        summary: timeline.summary,
        correlatedSequences: timeline.correlatedSequences.slice(0, 10),
        recentEvents: timeline.events.slice(-15).map((e) => ({
          type: e.type,
          timestamp: e.timestamp,
          summary: e.summary,
        })),
      },
    });
  } catch {
    sections.push({ id: "timeline", title: "Unified Timeline", content: "No timeline data." });
  }

  try {
    const financial = await analyzeFinancialForCase(caseId);
    sections.push({
      id: "financial",
      title: "Financial Intelligence (AML)",
      content: {
        summary: financial.summary,
        fanOut: financial.fanOut.slice(0, 5),
        fanIn: financial.fanIn.slice(0, 5),
        circularFlows: financial.circularFlows.slice(0, 5),
        smurfing: financial.smurfing.slice(0, 5),
        suspiciousScores: financial.suspiciousScores.slice(0, 10),
      },
    });
  } catch {
    sections.push({ id: "financial", title: "Financial Intelligence", content: "No transaction data." });
  }

  try {
    const cdr = await analyzeCdrForCase(caseId);
    sections.push({
      id: "communication",
      title: "Communication Intelligence",
      content: {
        summary: cdr.summary,
        frequentContacts: cdr.frequentContacts.slice(0, 10),
        bursts: cdr.bursts.slice(0, 5),
        colocations: cdr.colocations.slice(0, 5),
      },
    });
  } catch {
    sections.push({ id: "communication", title: "Communication Intelligence", content: "No CDR data." });
  }

  const relationships = await prisma.relationship.findMany({
    where: { sourceEntity: { caseId } },
    include: {
      sourceEntity: { select: { normalizedValue: true, type: true } },
      targetEntity: { select: { normalizedValue: true, type: true } },
    },
    take: 50,
    orderBy: { confidence: "desc" },
  });

  sections.push({
    id: "relationships",
    title: "Key Relationships",
    content: relationships.map((r) => ({
      type: r.relationType,
      from: `${r.sourceEntity.type}: ${r.sourceEntity.normalizedValue}`,
      to: `${r.targetEntity.type}: ${r.targetEntity.normalizedValue}`,
      confidence: r.confidence,
      approved: r.approved,
    })),
  });

  sections.push({
    id: "leads",
    title: "Investigative Leads & Alerts",
    content: alerts.map((a) => ({
      type: a.type,
      title: a.title,
      message: a.message,
      confidence: a.confidence,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
    })),
  });

  sections.push({
    id: "entities",
    title: "Key Entities",
    content: entities.map((e) => ({
      type: e.type,
      value: e.normalizedValue,
      confidence: e.confidence,
    })),
  });

  const sources = evidence.map((e) => ({
    type: e.type,
    ref: e.id,
    fileName: e.fileName,
    hash: e.sha256Hash,
  }));

  sections.push({
    id: "sources",
    title: "Evidence Sources",
    content: evidence.map((e) => ({
      fileName: e.fileName,
      type: e.type,
      status: e.ingestionStatus,
      sha256: e.sha256Hash,
      uploadedAt: e.createdAt.toISOString(),
    })),
  });

  return {
    meta: {
      caseId,
      caseNumber: caseData.caseNumber,
      crimeType: caseData.crimeType,
      status: caseData.status,
      priority: caseData.priority,
      location: caseData.location,
      generatedAt: new Date().toISOString(),
      generatedBy: user?.name ?? "System",
      classification: "RESTRICTED — LAW ENFORCEMENT SENSITIVE",
    },
    sections,
    sources,
    summary: {
      entityCount: caseData._count.entities,
      evidenceCount: caseData._count.evidence,
      alertCount: caseData._count.alerts,
      cdrCount: caseData._count.cdrRecords,
      transactionCount: caseData._count.transactions,
    },
  };
}

export async function saveReport(
  caseId: string,
  userId: string,
  report: InvestigationReport,
  pdfPath?: string
) {
  return prisma.report.create({
    data: {
      caseId,
      title: `Investigation Report — ${report.meta.caseNumber}`,
      content: report as object,
      pdfPath,
      createdById: userId,
    },
  });
}
