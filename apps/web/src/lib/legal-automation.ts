import { prisma } from "./db";

const EXCERPT_MAX = 4000;

export async function enrichLegalDocumentAfterIngest(evidenceId: string, jobId: string) {
  const [evidence, job] = await Promise.all([
    prisma.evidence.findUnique({ where: { id: evidenceId } }),
    prisma.ingestionJob.findUnique({ where: { id: jobId } }),
  ]);
  if (!evidence || !job?.result) return;

  const result = job.result as Record<string, unknown>;
  const text =
    (typeof result.text === "string" && result.text) ||
    (typeof result.extractedText === "string" && result.extractedText) ||
    "";

  const tags = new Set(evidence.legalTags ?? []);
  tags.add("SMART_INGEST");
  tags.add(`CAT_${evidence.legalCategory}`);
  if (evidence.ingestionStatus === "COMPLETED") tags.add("INDEXED");

  const excerpt = text ? text.slice(0, EXCERPT_MAX) : evidence.ocrTextExcerpt;

  await prisma.evidence.update({
    where: { id: evidenceId },
    data: {
      ocrTextExcerpt: excerpt ?? undefined,
      legalTags: Array.from(tags),
    },
  });
}

/** Smart automation — flag documents nearing retention expiry. */
export async function runRetentionComplianceScan(caseIds: string[]) {
  if (caseIds.length === 0) return { alertsCreated: 0 };

  const soon = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
  const docs = await prisma.evidence.findMany({
    where: {
      caseId: { in: caseIds },
      retentionUntil: { lte: soon, gte: new Date() },
    },
    select: { id: true, caseId: true, fileName: true, registerNumber: true, retentionUntil: true },
  });

  let alertsCreated = 0;
  for (const d of docs) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recent = await prisma.alert.findMany({
      where: { caseId: d.caseId, type: "LEGAL_RETENTION_DUE", createdAt: { gte: weekAgo } },
      select: { metadata: true },
    });
    const already = recent.some(
      (a) => (a.metadata as { evidenceId?: string } | null)?.evidenceId === d.id
    );
    if (already) continue;

    await prisma.alert.create({
      data: {
        type: "LEGAL_RETENTION_DUE",
        title: "Retention review due (SIH26190)",
        message: `${d.fileName} (${d.registerNumber ?? "—"}) retention ends ${d.retentionUntil?.toISOString().slice(0, 10)}`,
        caseId: d.caseId,
        confidence: 0.9,
        metadata: { evidenceId: d.id, registerNumber: d.registerNumber },
      },
    });
    alertsCreated++;
  }
  return { alertsCreated, scanned: docs.length };
}

export async function buildLegalCommandCenterMetrics(caseIds: string[]) {
  if (caseIds.length === 0) {
    return {
      totals: { documents: 0, sealed: 0, pendingReview: 0, bsaCertified: 0 },
      byCategory: [] as Array<{ category: string; count: number }>,
      byStatus: [] as Array<{ status: string; count: number }>,
      automation: { tagged: 0, withOcr: 0, linked: 0 },
    };
  }

  const docs = await prisma.evidence.findMany({
    where: { caseId: { in: caseIds } },
    select: {
      legalCategory: true,
      documentStatus: true,
      bsaCertifiedAt: true,
      legalTags: true,
      ocrTextExcerpt: true,
      relatedDocumentIds: true,
    },
  });

  const byCategory = new Map<string, number>();
  const byStatus = new Map<string, number>();
  for (const d of docs) {
    byCategory.set(d.legalCategory, (byCategory.get(d.legalCategory) ?? 0) + 1);
    byStatus.set(d.documentStatus, (byStatus.get(d.documentStatus) ?? 0) + 1);
  }

  return {
    psAlignment: "SIH26190",
    ministry: "MHA",
    theme: "Smart Automation",
    totals: {
      documents: docs.length,
      sealed: docs.filter((d) => d.documentStatus === "SEALED").length,
      pendingReview: docs.filter((d) =>
        ["REGISTERED", "UNDER_REVIEW"].includes(d.documentStatus)
      ).length,
      bsaCertified: docs.filter((d) => d.bsaCertifiedAt).length,
    },
    byCategory: Array.from(byCategory.entries()).map(([category, count]) => ({ category, count })),
    byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
    automation: {
      tagged: docs.filter((d) => d.legalTags.length > 0).length,
      withOcr: docs.filter((d) => !!d.ocrTextExcerpt).length,
      linked: docs.filter((d) => d.relatedDocumentIds.length > 0).length,
    },
  };
}

export async function exportLegalAuditBundle(caseId: string) {
  const docs = await prisma.evidence.findMany({
    where: { caseId },
    select: { id: true, fileName: true, registerNumber: true },
  });
  const ids = docs.map((d) => d.id);

  const [audits, custody, caseRow] = await Promise.all([
    prisma.auditLog.findMany({
      where: { OR: [{ resourceId: { in: ids } }, { resource: "case", resourceId: caseId }] },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.custodyLog.findMany({
      where: { evidenceId: { in: ids } },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.case.findUnique({
      where: { id: caseId },
      select: { caseNumber: true, crimeType: true, policeStation: true },
    }),
  ]);

  return {
    exportType: "MHA_LEGAL_AUDIT_BUNDLE_SIH26190",
    exportedAt: new Date().toISOString(),
    case: caseRow,
    documentIndex: docs,
    auditEvents: audits.length,
    custodyEvents: custody.length,
    audits,
    custody,
  };
}

export const LEGAL_DOCUMENT_TEMPLATES: Record<string, { fileName: string; content: string }> = {
  fir_outline: {
    fileName: "fir_outline_template.txt",
    content: `FIRST INFORMATION REPORT (Outline — SIH26190 register as FIR category)
Police Station:
District:
Date/Time of occurrence:
Place of occurrence:
Complainant name & contact:
Accused (if known):
Offence sections (BNS/IPC):
Brief facts (who/what/when/where):
Investigating Officer:
`,
  },
  witness_161: {
    fileName: "witness_161_template.txt",
    content: `WITNESS STATEMENT (161 CrPC style outline)
Case reference:
Witness name, age, address:
Statement recorded at:
Oath administered: Yes/No
Statement (verbatim summary):
Signature witness:
IO signature:
`,
  },
  seizure_memo: {
    fileName: "seizure_panchanama_template.txt",
    content: `SEIZURE MEMO / PANchnama (Exhibit register)
Case No:
Date/time of seizure:
Place:
Items seized (description):
Hash/photo ref:
Panch witnesses:
IO:
`,
  },
};
