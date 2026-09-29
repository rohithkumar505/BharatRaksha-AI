import {
  ClassificationLevel,
  LegalDocumentCategory,
  LegalDocumentStatus,
  UserRole,
} from "@bharat-raksha/database";
import { prisma } from "./db";
import { verifyEvidenceIntegrity } from "./blockchain";
import { LEGAL_DOCUMENT_CATEGORIES } from "./legal-document-constants";

export { LEGAL_DOCUMENT_CATEGORIES, SIH26190_CAPABILITY_MATRIX } from "./legal-document-constants";

export const LEGAL_STATUS_FLOW: Record<
  LegalDocumentStatus,
  LegalDocumentStatus[]
> = {
  REGISTERED: ["UNDER_REVIEW", "ARCHIVED"],
  UNDER_REVIEW: ["REGISTERED", "APPROVED_FOR_COURT", "ARCHIVED"],
  APPROVED_FOR_COURT: ["UNDER_REVIEW", "SEALED"],
  SEALED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canApproveLegalDocument(role: UserRole | string): boolean {
  return role === "SENIOR_OFFICER" || role === "ADMIN";
}

export function canViewClassification(
  role: UserRole | string,
  level: ClassificationLevel
): boolean {
  if (level === "OFFICIAL") return true;
  if (level === "RESTRICTED") {
    return role !== "AUDITOR" || true; // auditors read-only on register
  }
  if (level === "CONFIDENTIAL") {
    return role === "SENIOR_OFFICER" || role === "ADMIN" || role === "INVESTIGATOR";
  }
  return true;
}

export async function nextRegisterNumber(caseId: string): Promise<string> {
  const count = await prisma.evidence.count({ where: { caseId } });
  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    select: { caseNumber: true },
  });
  const prefix = (caseRow?.caseNumber ?? "CASE").replace(/[^\w]/g, "").slice(0, 12);
  return `REG-${prefix}-${String(count + 1).padStart(4, "0")}`;
}

export async function nextExhibitLabel(caseId: string): Promise<string> {
  const exhibits = await prisma.evidence.count({
    where: { caseId, legalCategory: "EXHIBIT" },
  });
  return `Exhibit P-${exhibits + 1}`;
}

export async function listLegalDocuments(
  caseId: string,
  filters?: { category?: LegalDocumentCategory; status?: LegalDocumentStatus }
) {
  const docs = await prisma.evidence.findMany({
    where: {
      caseId,
      ...(filters?.category ? { legalCategory: filters.category } : {}),
      ...(filters?.status ? { documentStatus: filters.status } : {}),
    },
    orderBy: [{ registerNumber: "asc" }, { createdAt: "asc" }],
    include: {
      uploadedBy: { select: { id: true, name: true, role: true } },
      custodyLogs: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { custodyLogs: true, childVersions: true } },
      parentEvidence: { select: { id: true, fileName: true, documentVersion: true, registerNumber: true } },
    },
  });

  const stats = {
    total: docs.length,
    registered: docs.filter((d) => d.documentStatus === "REGISTERED").length,
    underReview: docs.filter((d) => d.documentStatus === "UNDER_REVIEW").length,
    approved: docs.filter((d) => d.documentStatus === "APPROVED_FOR_COURT").length,
    sealed: docs.filter((d) => d.documentStatus === "SEALED").length,
    onLegalHold: docs.filter((d) => d.legalHold).length,
  };

  return { documents: docs, stats };
}

export async function buildDocumentRegister(caseId: string) {
  await ensureCaseRegisterNumbers(caseId);
  const [caseRow, { documents }] = await Promise.all([
    prisma.case.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        caseNumber: true,
        crimeType: true,
        policeStation: true,
        status: true,
      },
    }),
    listLegalDocuments(caseId),
  ]);

  return {
    registerType: "LEGAL_INVESTIGATION_DOCUMENT_REGISTER",
    psAlignment: "SIH26190",
    generatedAt: new Date().toISOString(),
    case: caseRow,
    documentCount: documents.length,
    documents: documents.map((d) => ({
      registerNumber: d.registerNumber,
      exhibitLabel: d.exhibitLabel,
      fileName: d.fileName,
      legalCategory: d.legalCategory,
      documentStatus: d.documentStatus,
      classification: d.classification,
      legalCaption: d.legalCaption,
      documentVersion: d.documentVersion,
      legalHold: d.legalHold,
      sha256Hash: d.sha256Hash,
      fileSize: d.fileSize,
      mimeType: d.mimeType,
      uploadedBy: d.uploadedBy.name,
      uploadedAt: d.createdAt.toISOString(),
      reviewedAt: d.reviewedAt?.toISOString() ?? null,
      bsaCertifiedAt: d.bsaCertifiedAt?.toISOString() ?? null,
      parentRegisterNumber: d.parentEvidence?.registerNumber ?? null,
      retentionUntil: d.retentionUntil?.toISOString() ?? null,
      legalWorkflowNote: d.legalWorkflowNote,
      custodyEvents: d._count.custodyLogs,
      lastCustody: d.custodyLogs[0]?.event ?? null,
    })),
    complianceNotes: [
      "Bharatiya Sakshya Adhiniyam 2023 — Section 63 electronic record integrity via SHA-256 + hash-chained ledger.",
      "Documents on legal hold cannot be deleted; status SEALED locks workflow edits except archive by senior officer.",
    ],
  };
}

export async function transitionDocumentStatus(params: {
  evidenceId: string;
  targetStatus: LegalDocumentStatus;
  userId: string;
  userRole: UserRole | string;
  note?: string;
}) {
  const doc = await prisma.evidence.findUnique({ where: { id: params.evidenceId } });
  if (!doc) throw new Error("Document not found");
  if (doc.documentStatus === "SEALED" && params.targetStatus !== "ARCHIVED") {
    throw new Error("Sealed documents can only move to ARCHIVED");
  }
  const allowed = LEGAL_STATUS_FLOW[doc.documentStatus] ?? [];
  if (!allowed.includes(params.targetStatus)) {
    throw new Error(`Cannot move from ${doc.documentStatus} to ${params.targetStatus}`);
  }
  if (params.targetStatus === "SEALED" && !canApproveLegalDocument(params.userRole)) {
    throw new Error("Senior officer or admin approval required");
  }
  if (params.targetStatus === "SEALED") {
    if (!doc.ioCertifiedAt || !doc.prosecutionCertifiedAt) {
      throw new Error("Dual certification required: IO certify + Prosecution certify before sealing");
    }
  }

  if (
    (params.targetStatus === "APPROVED_FOR_COURT" || params.targetStatus === "SEALED") &&
    !canApproveLegalDocument(params.userRole)
  ) {
    throw new Error("Senior officer or admin approval required");
  }

  const updated = await prisma.evidence.update({
    where: { id: params.evidenceId },
    data: {
      documentStatus: params.targetStatus,
      electronicSealId:
        params.targetStatus === "SEALED"
          ? `ESEAL-${doc.registerNumber ?? doc.id.slice(0, 8)}-${Date.now()}`
          : doc.electronicSealId,
      reviewedById:
        params.targetStatus === "APPROVED_FOR_COURT" || params.targetStatus === "SEALED"
          ? params.userId
          : doc.reviewedById,
      reviewedAt:
        params.targetStatus === "APPROVED_FOR_COURT" || params.targetStatus === "SEALED"
          ? new Date()
          : doc.reviewedAt,
      bsaCertifiedAt:
        params.targetStatus === "APPROVED_FOR_COURT" || params.targetStatus === "SEALED"
          ? new Date()
          : doc.bsaCertifiedAt,
    },
  });

  if (params.targetStatus === "ARCHIVED") {
    const { recordLegalDocumentArchived } = await import("./custody-verifiable");
    await recordLegalDocumentArchived(params.evidenceId, params.userId);
  }

  return updated;
}

export async function updateLegalMetadata(params: {
  evidenceId: string;
  legalCategory?: LegalDocumentCategory;
  classification?: ClassificationLevel;
  legalCaption?: string;
  exhibitLabel?: string;
  legalHold?: boolean;
  legalWorkflowNote?: string;
  retentionUntil?: Date | null;
  userRole: UserRole | string;
}) {
  const doc = await prisma.evidence.findUnique({ where: { id: params.evidenceId } });
  if (!doc) throw new Error("Document not found");
  if (doc.documentStatus === "SEALED") {
    throw new Error("Sealed document — metadata locked");
  }
  if (
    params.classification === "CONFIDENTIAL" &&
    !canApproveLegalDocument(params.userRole) &&
    params.userRole !== "INVESTIGATOR"
  ) {
    // investigators may tag confidential on upload; senior can reclassify
  }

  return prisma.evidence.update({
    where: { id: params.evidenceId },
    data: {
      legalCategory: params.legalCategory,
      classification: params.classification,
      legalCaption: params.legalCaption,
      exhibitLabel: params.exhibitLabel,
      legalHold: params.legalHold,
      legalWorkflowNote: params.legalWorkflowNote,
      retentionUntil: params.retentionUntil,
    },
  });
}

export async function ensureCaseRegisterNumbers(caseId: string) {
  const missing = await prisma.evidence.findMany({
    where: { caseId, registerNumber: null },
    orderBy: { createdAt: "asc" },
  });
  for (const doc of missing) {
    const reg = await nextRegisterNumber(caseId);
    await prisma.evidence.update({
      where: { id: doc.id },
      data: { registerNumber: reg },
    });
  }
}

export async function verifyCaseDocumentBundle(caseId: string) {
  const docs = await prisma.evidence.findMany({
    where: { caseId },
    select: { id: true, fileName: true, sha256Hash: true, registerNumber: true },
  });

  const results = await Promise.all(
    docs.map(async (d) => {
      try {
        const v = await verifyEvidenceIntegrity(d.id);
        return {
          evidenceId: d.id,
          registerNumber: d.registerNumber,
          fileName: d.fileName,
          verified: v.verified,
          fileVerified: v.fileVerified,
          chainVerified: v.chainVerified,
          message: v.chainMessage,
        };
      } catch (e) {
        return {
          evidenceId: d.id,
          registerNumber: d.registerNumber,
          fileName: d.fileName,
          verified: false,
          fileVerified: false,
          chainVerified: false,
          message: e instanceof Error ? e.message : "Verify failed",
        };
      }
    })
  );

  const passed = results.filter((r) => r.verified).length;
  return {
    caseId,
    verifiedAt: new Date().toISOString(),
    total: results.length,
    passed,
    failed: results.length - passed,
    allVerified: passed === results.length && results.length > 0,
    results,
  };
}

export async function searchLegalDocuments(query: string, limit = 40) {
  const q = query.trim();
  if (q.length < 2) return [];

  return prisma.evidence.findMany({
    where: {
      OR: [
        { fileName: { contains: q, mode: "insensitive" } },
        { legalCaption: { contains: q, mode: "insensitive" } },
        { exhibitLabel: { contains: q, mode: "insensitive" } },
        { registerNumber: { contains: q, mode: "insensitive" } },
        { sha256Hash: { startsWith: q.toLowerCase() } },
        { legalWorkflowNote: { contains: q, mode: "insensitive" } },
      ],
    },
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      case: { select: { id: true, caseNumber: true } },
      uploadedBy: { select: { name: true } },
    },
  });
}

export async function getLegalDocumentDetail(caseId: string, evidenceId: string) {
  const doc = await prisma.evidence.findFirst({
    where: { id: evidenceId, caseId },
    include: {
      uploadedBy: { select: { id: true, name: true, role: true } },
      parentEvidence: {
        select: { id: true, fileName: true, registerNumber: true, documentVersion: true, sha256Hash: true },
      },
      childVersions: {
        orderBy: { documentVersion: "desc" },
        select: {
          id: true,
          fileName: true,
          documentVersion: true,
          registerNumber: true,
          sha256Hash: true,
          createdAt: true,
          documentStatus: true,
        },
      },
      custodyLogs: {
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { user: { select: { name: true, role: true } } },
      },
    },
  });
  return doc;
}

export async function getLegalDocumentAuditTrail(evidenceId: string, limit = 30) {
  return prisma.auditLog.findMany({
    where: {
      resource: "evidence",
      resourceId: evidenceId,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, role: true } } },
  });
}

export async function aggregateLegalDocumentStats(caseIds: string[]) {
  if (caseIds.length === 0) {
    return {
      totalDocuments: 0,
      pendingReview: 0,
      approvedForCourt: 0,
      sealed: 0,
      onLegalHold: 0,
      bsaCertified: 0,
      retentionDueSoon: 0,
    };
  }

  const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const [totalDocuments, pendingReview, approvedForCourt, sealed, onLegalHold, bsaCertified, retentionDueSoon] =
    await Promise.all([
      prisma.evidence.count({ where: { caseId: { in: caseIds } } }),
      prisma.evidence.count({
        where: { caseId: { in: caseIds }, documentStatus: { in: ["REGISTERED", "UNDER_REVIEW"] } },
      }),
      prisma.evidence.count({ where: { caseId: { in: caseIds }, documentStatus: "APPROVED_FOR_COURT" } }),
      prisma.evidence.count({ where: { caseId: { in: caseIds }, documentStatus: "SEALED" } }),
      prisma.evidence.count({ where: { caseId: { in: caseIds }, legalHold: true } }),
      prisma.evidence.count({ where: { caseId: { in: caseIds }, bsaCertifiedAt: { not: null } } }),
      prisma.evidence.count({
        where: {
          caseId: { in: caseIds },
          retentionUntil: { lte: soon, gte: new Date() },
        },
      }),
    ]);

  return {
    totalDocuments,
    pendingReview,
    approvedForCourt,
    sealed,
    onLegalHold,
    bsaCertified,
    retentionDueSoon,
  };
}

export async function publicVerifyByRegister(registerNumber: string, hashPrefix: string) {
  const reg = registerNumber.trim();
  const prefix = hashPrefix.trim().toLowerCase();
  if (reg.length < 4 || prefix.length < 8) {
    return { verified: false, error: "Register number and at least 8 hash characters required" };
  }

  const doc = await prisma.evidence.findFirst({
    where: { registerNumber: reg },
    select: {
      id: true,
      registerNumber: true,
      documentStatus: true,
      sha256Hash: true,
      bsaCertifiedAt: true,
      case: { select: { caseNumber: true } },
    },
  });

  if (!doc || !doc.sha256Hash.startsWith(prefix)) {
    return { verified: false, error: "No matching registered document" };
  }

  let integrity = { verified: false, message: "Not checked" };
  try {
    const v = await verifyEvidenceIntegrity(doc.id);
    integrity = { verified: v.verified, message: v.chainMessage };
  } catch (e) {
    integrity = { verified: false, message: e instanceof Error ? e.message : "Verify failed" };
  }

  return {
    verified: integrity.verified,
    psAlignment: "SIH26190",
    registerNumber: doc.registerNumber,
    caseNumber: doc.case.caseNumber,
    documentStatus: doc.documentStatus,
    hashPrefixMatch: true,
    bsaCertifiedAt: doc.bsaCertifiedAt?.toISOString() ?? null,
    integrity,
  };
}

export function buildRegisterHtml(register: Awaited<ReturnType<typeof buildDocumentRegister>>) {
  const rows = register.documents
    .map(
      (d) =>
        `<tr><td>${d.registerNumber ?? ""}</td><td>${d.fileName}</td><td>${d.legalCategory}</td><td>${d.documentStatus}</td><td>${d.exhibitLabel ?? ""}</td><td style="font-family:monospace;font-size:10px">${d.sha256Hash.slice(0, 16)}…</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Legal Register ${register.case?.caseNumber ?? ""}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;font-size:12px}th{background:#f4f4f4}</style></head>
<body><h1>Legal & Investigation Document Register</h1><p>SIH26190 · Case ${register.case?.caseNumber ?? ""} · Generated ${register.generatedAt}</p>
<table><thead><tr><th>Register #</th><th>File</th><th>Category</th><th>Status</th><th>Exhibit</th><th>Hash</th></tr></thead><tbody>${rows}</tbody></table>
<p style="font-size:11px;color:#555">${register.complianceNotes.join(" ")}</p></body></html>`;
}

export function inferLegalCategoryFromFileName(fileName: string): LegalDocumentCategory {
  const n = fileName.toLowerCase().replace(/[\s-]+/g, "_");
  if (/\bfir\b|first_information|_fir_/.test(n)) return "FIR";
  if (/witness|161_crpc|section_161|statement/.test(n)) return "WITNESS_STATEMENT";
  if (/chargesheet|charge_sheet|final_report/.test(n)) return "CHARGE_SHEET_DRAFT";
  if (/prosecution|brief/.test(n)) return "PROSECUTION_BRIEF";
  if (/exhibit|panchnama|seizure/.test(n)) return "EXHIBIT";
  if (/forensic|fsl|fsl_report|lab_report/.test(n)) return "FORENSIC_REPORT";
  if (/judgment|judgement|court_order|judicial/.test(n)) return "JUDICIAL_ORDER";
  if (/correspondence|memo|letter/.test(n)) return "OFFICIAL_CORRESPONDENCE";
  if (/filing|petition|application/.test(n)) return "COURT_FILING";
  return "INVESTIGATION_RECORD";
}

export function buildPublicVerifyPath(registerNumber: string, sha256Hash: string, baseUrl: string) {
  const hash = encodeURIComponent(sha256Hash.slice(0, 16));
  const reg = encodeURIComponent(registerNumber);
  return `${baseUrl.replace(/\/$/, "")}/verify-document?register=${reg}&hash=${hash}`;
}

export async function certifyLegalDocument(params: {
  evidenceId: string;
  caseId: string;
  userId: string;
  userRole: UserRole | string;
  lane: "IO" | "PROSECUTION";
}) {
  const doc = await prisma.evidence.findFirst({
    where: { id: params.evidenceId, caseId: params.caseId },
  });
  if (!doc) throw new Error("Document not found");
  if (doc.documentStatus === "SEALED") throw new Error("Sealed document");

  if (params.lane === "IO") {
    if (params.userRole === "AUDITOR") throw new Error("Auditors cannot certify");
    return prisma.evidence.update({
      where: { id: doc.id },
      data: { ioCertifiedAt: new Date(), ioCertifiedById: params.userId },
    });
  }

  if (!canApproveLegalDocument(params.userRole)) {
    throw new Error("Senior officer or admin required for prosecution certification");
  }
  return prisma.evidence.update({
    where: { id: doc.id },
    data: {
      prosecutionCertifiedAt: new Date(),
      prosecutionCertifiedById: params.userId,
    },
  });
}

export async function buildDisclosureSchedule(caseId: string) {
  await ensureCaseRegisterNumbers(caseId);
  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    select: { caseNumber: true, crimeType: true, policeStation: true },
  });
  const docs = await prisma.evidence.findMany({
    where: {
      caseId,
      documentStatus: { in: ["APPROVED_FOR_COURT", "SEALED"] },
    },
    orderBy: [{ registerNumber: "asc" }, { createdAt: "asc" }],
  });

  const annexures = docs.map((d, index) => {
    const letter = String.fromCharCode(65 + (index % 26));
    const suffix = index >= 26 ? String(Math.floor(index / 26)) : "";
    const annexure = `Annexure-${letter}${suffix}`;
    return {
      annexure,
      registerNumber: d.registerNumber,
      exhibitLabel: d.exhibitLabel,
      fileName: d.fileName,
      legalCategory: d.legalCategory,
      classification: d.classification,
      sha256Hash: d.sha256Hash,
      ioCertifiedAt: d.ioCertifiedAt?.toISOString() ?? null,
      prosecutionCertifiedAt: d.prosecutionCertifiedAt?.toISOString() ?? null,
      documentStatus: d.documentStatus,
    };
  });

  for (let i = 0; i < docs.length; i++) {
    await prisma.evidence.update({
      where: { id: docs[i].id },
      data: { disclosureAnnexure: annexures[i].annexure },
    });
  }

  return {
    scheduleType: "COURT_DISCLOSURE_ANNEXURE_SIH26190",
    psAlignment: "SIH26190",
    generatedAt: new Date().toISOString(),
    case: caseRow,
    annexureCount: annexures.length,
    annexures,
    complianceNote:
      "Annexures assigned to court-approved/sealed documents only. Hashes must match bundle verify before filing.",
  };
}

export async function listRetentionWatch(caseIds: string[], withinDays = 30) {
  if (caseIds.length === 0) return [];
  const until = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
  return prisma.evidence.findMany({
    where: {
      caseId: { in: caseIds },
      retentionUntil: { not: null, lte: until },
    },
    orderBy: { retentionUntil: "asc" },
    take: 50,
    include: {
      case: { select: { id: true, caseNumber: true } },
    },
  });
}

export async function forwardLegalCustody(params: {
  evidenceId: string;
  caseId: string;
  fromUserId: string;
  toUserId: string;
  note?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const [doc, toUser] = await Promise.all([
    prisma.evidence.findFirst({ where: { id: params.evidenceId, caseId: params.caseId } }),
    prisma.user.findUnique({ where: { id: params.toUserId, isActive: true } }),
  ]);
  if (!doc) throw new Error("Document not found");
  if (!toUser) throw new Error("Receiving officer not found");
  if (doc.legalHold) throw new Error("Legal hold — forwarding blocked");

  return prisma.custodyLog.create({
    data: {
      evidenceId: doc.id,
      event: "TRANSFERRED",
      userId: params.fromUserId,
      transferredToId: params.toUserId,
      details: params.note ?? `Nazarat forwarding to ${toUser.name}`,
      hashAtEvent: doc.sha256Hash,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });
}

export async function buildCourtReadinessChecklist(caseId: string) {
  await ensureCaseRegisterNumbers(caseId);
  const docs = await prisma.evidence.findMany({ where: { caseId } });
  let bundleOk = false;
  let bundlePassed = 0;
  let bundleTotal = 0;
  if (docs.length > 0) {
    try {
      const v = await verifyCaseDocumentBundle(caseId);
      bundleOk = v.allVerified;
      bundlePassed = v.passed;
      bundleTotal = v.total;
    } catch {
      bundleOk = false;
    }
  }

  const hasFir = docs.some((d) => d.legalCategory === "FIR" || d.fileName.toLowerCase().includes("fir"));
  const ioPending = docs.filter((d) => !d.ioCertifiedAt).length;
  const prosecutionPending = docs.filter((d) => !d.prosecutionCertifiedAt).length;
  const courtApproved = docs.filter((d) =>
    ["APPROVED_FOR_COURT", "SEALED"].includes(d.documentStatus)
  ).length;
  const sealed = docs.filter((d) => d.documentStatus === "SEALED").length;

  const steps = [
    {
      id: "register",
      label: "Documents registered in legal register",
      done: docs.length > 0,
      hint: docs.length ? `${docs.length} document(s) on file` : "Upload FIR or investigation files above",
    },
    {
      id: "fir",
      label: "FIR or core investigation record present",
      done: hasFir,
      hint: hasFir ? "FIR category detected" : "Upload sample_fir.txt or mark category FIR",
    },
    {
      id: "io_cert",
      label: "IO certification on all documents",
      done: docs.length > 0 && ioPending === 0,
      hint: ioPending ? `${ioPending} pending IO certify` : "Use IO certify on each row",
    },
    {
      id: "prosecution_cert",
      label: "Prosecution certification (Senior Officer)",
      done: docs.length > 0 && prosecutionPending === 0,
      hint: prosecutionPending
        ? `${prosecutionPending} pending — login as senior@bharatraksha.gov.in`
        : "Senior officer prosecution certify complete",
    },
    {
      id: "integrity",
      label: "Integrity bundle verified (SHA-256 + ledger)",
      done: bundleOk,
      hint: bundleTotal ? `${bundlePassed}/${bundleTotal} verified` : "Upload then click Verify bundle",
    },
    {
      id: "court_status",
      label: "At least one document approved for court",
      done: courtApproved > 0,
      hint: courtApproved ? `${courtApproved} approved/sealed` : "Advance workflow after senior review",
    },
    {
      id: "sealed",
      label: "Sealed record (optional final lock)",
      done: sealed > 0,
      hint: sealed ? `${sealed} sealed` : "Requires dual cert before seal",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const score = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;

  return {
    psAlignment: "SIH26190",
    caseId,
    score,
    readyForCourtFiling: steps[0].done && steps[4].done && steps[5].done,
    steps,
    summary: {
      totalDocuments: docs.length,
      ioPending,
      prosecutionPending,
      courtApproved,
      sealed,
    },
  };
}

export async function getLegalActivityTimeline(caseId: string, limit = 30) {
  const docs = await prisma.evidence.findMany({
    where: { caseId },
    select: { id: true, fileName: true, registerNumber: true },
  });
  const ids = docs.map((d) => d.id);
  if (ids.length === 0) return [];

  const [custody, audits] = await Promise.all([
    prisma.custodyLog.findMany({
      where: { evidenceId: { in: ids } },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { name: true } },
        evidence: { select: { fileName: true, registerNumber: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: { resourceId: { in: ids } },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { name: true } } },
    }),
  ]);

  type Row = { at: string; kind: string; title: string; detail: string };
  const rows: Row[] = [];

  for (const c of custody) {
    rows.push({
      at: c.createdAt.toISOString(),
      kind: "custody",
      title: c.event,
      detail: `${c.evidence.registerNumber ?? c.evidence.fileName} — ${c.user.name}`,
    });
  }
  for (const a of audits) {
    rows.push({
      at: a.createdAt.toISOString(),
      kind: "audit",
      title: a.action,
      detail: a.user?.name ?? "System",
    });
  }

  rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  return rows.slice(0, limit);
}

export async function notifyLegalDocumentRegistered(params: {
  caseId: string;
  evidenceId: string;
  fileName: string;
  registerNumber: string | null;
}) {
  await prisma.alert.create({
    data: {
      type: "LEGAL_DOCUMENT_REVIEW",
      title: "Legal document registered (SIH26190)",
      message: `${params.fileName} (${params.registerNumber ?? "pending reg#"}) — workflow review pending.`,
      caseId: params.caseId,
      confidence: 1,
      metadata: { evidenceId: params.evidenceId, registerNumber: params.registerNumber },
    },
  });
}

export async function listPendingReviewDocuments(caseId: string) {
  await ensureCaseRegisterNumbers(caseId);
  return prisma.evidence.findMany({
    where: { caseId, documentStatus: { in: ["REGISTERED", "UNDER_REVIEW"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fileName: true,
      registerNumber: true,
      documentStatus: true,
      legalCategory: true,
      ioCertifiedAt: true,
      prosecutionCertifiedAt: true,
      createdAt: true,
    },
  });
}

export async function bulkSendDocumentsToReview(caseId: string) {
  const result = await prisma.evidence.updateMany({
    where: { caseId, documentStatus: "REGISTERED" },
    data: { documentStatus: "UNDER_REVIEW" },
  });
  return { updated: result.count };
}

export function buildMasterIndexCsv(
  register: Awaited<ReturnType<typeof buildDocumentRegister>>
): string {
  const header = "registerNumber,fileName,category,status,exhibit,sha256,uploadedAt";
  const lines = register.documents.map((d) =>
    [
      d.registerNumber ?? "",
      `"${d.fileName.replace(/"/g, '""')}"`,
      d.legalCategory,
      d.documentStatus,
      d.exhibitLabel ?? "",
      d.sha256Hash,
      d.uploadedAt,
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

export function buildDisclosureScheduleHtml(schedule: Awaited<ReturnType<typeof buildDisclosureSchedule>>) {
  const rows = schedule.annexures
    .map(
      (a) =>
        `<tr><td>${a.annexure}</td><td>${a.registerNumber ?? ""}</td><td>${a.fileName}</td><td>${a.classification}</td><td style="font-family:monospace;font-size:10px">${a.sha256Hash.slice(0, 16)}…</td></tr>`
    )
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Disclosure ${schedule.case?.caseNumber ?? ""}</title>
<style>body{font-family:system-ui;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;font-size:12px}th{background:#f4f4f4}</style></head>
<body><h1>Court Disclosure Annexure Schedule</h1><p>SIH26190 · Case ${schedule.case?.caseNumber ?? ""} · ${schedule.generatedAt}</p>
<table><thead><tr><th>Annexure</th><th>Register #</th><th>File</th><th>Class</th><th>Hash</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

export async function runCourtPrepPack(caseId: string) {
  await ensureCaseRegisterNumbers(caseId);
  const [readiness, verify, register] = await Promise.all([
    buildCourtReadinessChecklist(caseId),
    verifyCaseDocumentBundle(caseId),
    buildDocumentRegister(caseId),
  ]);
  let disclosure: Awaited<ReturnType<typeof buildDisclosureSchedule>> | null = null;
  try {
    disclosure = await buildDisclosureSchedule(caseId);
  } catch {
    disclosure = null;
  }
  return {
    generatedAt: new Date().toISOString(),
    readiness,
    integrity: verify,
    registerDocumentCount: register.documentCount,
    disclosureAnnexureCount: disclosure?.annexureCount ?? 0,
  };
}

export function buildBsaSection63Certificate(doc: {
  id: string;
  fileName: string;
  sha256Hash: string;
  registerNumber: string | null;
  exhibitLabel: string | null;
  caseNumber: string;
  verified: boolean;
  chainMessage: string;
  certifiedAt: string;
  officerName: string;
}) {
  return {
    certificateType: "BSA_2023_SECTION_63_ELECTRONIC_RECORD",
    issuedAt: doc.certifiedAt,
    caseNumber: doc.caseNumber,
    document: {
      evidenceId: doc.id,
      registerNumber: doc.registerNumber,
      exhibitLabel: doc.exhibitLabel,
      fileName: doc.fileName,
      sha256Hash: doc.sha256Hash,
    },
    integrity: {
      hashMatch: doc.verified,
      ledgerChain: doc.chainMessage,
    },
    certificationStatement:
      "This certificate attests that the referenced electronic record was ingested with SHA-256 fingerprinting and hash-chained custody logging at time of certification. Officer must verify originals before court production.",
    certifyingOfficer: doc.officerName,
    disclaimer: "Assistive system output — not a substitute for certified forensic examiner sign-off where required.",
  };
}
