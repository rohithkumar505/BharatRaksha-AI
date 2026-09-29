import { prisma } from "./db";

/**
 * Court-pack manifest — indexes reports, evidence SHA-256 hashes, alerts, and
 * custody summary for disclosure / case-file hygiene. Downloads as JSON metadata
 * (not a sealed ZIP of original PDFs).
 */

import { buildDocumentRegister, ensureCaseRegisterNumbers } from "./legal-documents";

export interface CourtPackManifest {
  caseId: string;
  caseNumber: string;
  generatedAt: string;
  disclaimer: string;
  reports: Array<{
    id: string;
    title: string;
    createdAt: string;
    pdfPath: string | null;
    hasContent: boolean;
  }>;
  evidence: Array<{
    id: string;
    fileName: string;
    type: string;
    sha256Hash: string;
    fileSize: number;
    blockchainTxId: string | null;
    ingestionStatus: string;
  }>;
  alerts: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    confidence: number | null;
    status: string;
    createdAt: string;
  }>;
  custodySummary: Array<{
    evidenceId: string;
    fileName: string;
    eventCount: number;
    lastEvent: string | null;
  }>;
  downloadMeta: {
    suggestedFileName: string;
    contentType: string;
    sections: string[];
  };
  legalDocumentRegister?: Awaited<ReturnType<typeof buildDocumentRegister>>;
}

/**
 * Court-pack download metadata JSON: reports, evidence hashes, alert summaries.
 */
export async function buildCourtPackManifest(
  caseId: string
): Promise<CourtPackManifest> {
  const [caseRow, reports, evidence, alerts] = await Promise.all([
    prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, caseNumber: true, crimeType: true },
    }),
    prisma.report.findMany({
      where: { caseId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, createdAt: true, pdfPath: true, content: true },
    }),
    prisma.evidence.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        fileName: true,
        type: true,
        sha256Hash: true,
        fileSize: true,
        blockchainTxId: true,
        ingestionStatus: true,
        custodyLogs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { event: true, createdAt: true },
        },
        _count: { select: { custodyLogs: true } },
      },
    }),
    prisma.alert.findMany({
      where: { caseId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        confidence: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  const caseNumber = caseRow?.caseNumber ?? caseId;
  const stamp = new Date().toISOString().slice(0, 10);

  await ensureCaseRegisterNumbers(caseId);
  const legalDocumentRegister = await buildDocumentRegister(caseId);

  return {
    caseId,
    caseNumber,
    generatedAt: new Date().toISOString(),
    disclaimer:
      "Court pack manifest for investigator download packaging. Verify hashes and originals before filing.",
    reports: reports.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
      pdfPath: r.pdfPath,
      hasContent: r.content != null,
    })),
    evidence: evidence.map((e) => ({
      id: e.id,
      fileName: e.fileName,
      type: e.type,
      sha256Hash: e.sha256Hash,
      fileSize: e.fileSize,
      blockchainTxId: e.blockchainTxId,
      ingestionStatus: e.ingestionStatus,
    })),
    alerts: alerts.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      message: a.message.slice(0, 500),
      confidence: a.confidence,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
    })),
    custodySummary: evidence.map((e) => ({
      evidenceId: e.id,
      fileName: e.fileName,
      eventCount: e._count.custodyLogs,
      lastEvent: e.custodyLogs[0]
        ? `${e.custodyLogs[0].event}@${e.custodyLogs[0].createdAt.toISOString()}`
        : null,
    })),
    downloadMeta: {
      suggestedFileName: `court-pack-${caseNumber.replace(/[^\w.-]+/g, "_")}-${stamp}.json`,
      contentType: "application/json",
      sections: [
        "reports",
        "evidence_hashes",
        "alert_summaries",
        "custody_summary",
        "legal_document_register",
      ],
    },
    legalDocumentRegister,
  };
}
