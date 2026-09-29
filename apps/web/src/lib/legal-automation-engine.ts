import { prisma } from "./db";
import { Prisma } from "@bharat-raksha/database";
import { getRedis } from "./redis";
import { fileExists } from "./s3";
import {
  bulkSendDocumentsToReview,
  buildCourtReadinessChecklist,
  ensureCaseRegisterNumbers,
  runCourtPrepPack,
  verifyCaseDocumentBundle,
} from "./legal-documents";
import { buildLegalCommandCenterMetrics, runRetentionComplianceScan } from "./legal-automation";
import { logAudit } from "./audit";

export type AutomationStep = {
  id: string;
  ok: boolean;
  detail?: Record<string, unknown>;
  error?: string;
};

export const LEGAL_AUTOMATION_PLAYBOOKS = [
  {
    id: "mha_one_click_court_file",
    scope: "case" as const,
    title: "One-Click MHA Court File",
    titleHi: "एक-क्लिक MHA कोर्ट फाइल",
    description:
      "Register sync, bulk review queue, FIR pack linking, exhibit labels, integrity verify, court prep — full SIH26190 chain.",
    uniqueDifferentiator: "Dual-lane court readiness in one audited run (no other SIH stack ships this playbook).",
  },
  {
    id: "integrity_remediation_sweep",
    scope: "case" as const,
    title: "Integrity remediation sweep",
    titleHi: "अखंडता सुधार स्कैन",
    description: "Re-verify SHA-256 + ledger for every document; raise alerts on failures.",
    uniqueDifferentiator: "Hash-chained MinIO verification with auto MHA alerts.",
  },
  {
    id: "smart_fir_pack_linker",
    scope: "case" as const,
    title: "Smart FIR pack linker",
    titleHi: "स्मार्ट FIR पैक लिंकर",
    description: "Auto-link FIR, 161 statements, seizure memos, and exhibits in one related-document graph.",
    uniqueDifferentiator: "Category-aware relationship graph for disclosure bundles.",
  },
  {
    id: "org_daily_compliance",
    scope: "org" as const,
    title: "Org daily compliance autopilot",
    titleHi: "संगठन दैनिक अनुपालन",
    description: "Retention scan + command metrics + duplicate hash watchdog across all accessible cases.",
    uniqueDifferentiator: "NIC-style org-wide legal automation with retention alerts.",
  },
] as const;

export type LegalPlaybookId = (typeof LEGAL_AUTOMATION_PLAYBOOKS)[number]["id"];

async function recordAutomationRun(params: {
  playbookId: string;
  caseId?: string;
  userId?: string;
  status: string;
  steps: AutomationStep[];
  summary?: Record<string, unknown>;
}) {
  return prisma.legalAutomationRun.create({
    data: {
      playbookId: params.playbookId,
      caseId: params.caseId,
      userId: params.userId,
      status: params.status,
      steps: params.steps as unknown as Prisma.InputJsonValue,
      summary: (params.summary ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function dispatchLegalAutomationWebhook(payload: Record<string, unknown>, userId?: string) {
  const url = process.env.LEGAL_AUTOMATION_WEBHOOK_URL;
  await logAudit({
    userId,
    action: "LEGAL_AUTOMATION_EVENT",
    resource: "legal_automation",
    details: { webhookConfigured: !!url, payload },
  });
  if (!url) return { delivered: false, reason: "LEGAL_AUTOMATION_WEBHOOK_URL not set" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "BharatRaksha-SIH26190", ...payload }),
      signal: AbortSignal.timeout(8000),
    });
    return { delivered: res.ok, status: res.status };
  } catch (e) {
    return { delivered: false, error: e instanceof Error ? e.message : "webhook failed" };
  }
}

export async function findDuplicateHashesInCase(caseId: string) {
  const docs = await prisma.evidence.findMany({
    where: { caseId },
    select: { id: true, fileName: true, registerNumber: true, sha256Hash: true, legalCategory: true },
  });
  const byHash = new Map<string, typeof docs>();
  for (const d of docs) {
    const list = byHash.get(d.sha256Hash) ?? [];
    list.push(d);
    byHash.set(d.sha256Hash, list);
  }
  const groups = Array.from(byHash.entries())
    .filter(([, list]) => list.length > 1)
    .map(([hash, documents]) => ({
      sha256Hash: hash,
      count: documents.length,
      documents: documents.map((x) => ({
        id: x.id,
        fileName: x.fileName,
        registerNumber: x.registerNumber,
        legalCategory: x.legalCategory,
      })),
    }));
  return { duplicateGroups: groups.length, groups };
}

export function suggestLegalCaptionFromDocument(doc: {
  fileName: string;
  legalCategory: string;
  ocrTextExcerpt?: string | null;
}): { caption: string; source: "ocr" | "filename" | "category" } {
  const excerpt = doc.ocrTextExcerpt?.trim();
  if (excerpt) {
    const line = excerpt.split(/\n/).find((l) => l.trim().length > 12)?.trim().slice(0, 240);
    if (line) return { caption: line, source: "ocr" };
  }
  const base = doc.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (base.length > 3) return { caption: base.slice(0, 240), source: "filename" };
  return {
    caption: `${doc.legalCategory.replace(/_/g, " ")} — ${doc.fileName}`.slice(0, 240),
    source: "category",
  };
}

export async function autoLinkInvestigationDocumentPack(caseId: string) {
  const cats = ["FIR", "WITNESS_STATEMENT", "EXHIBIT", "INVESTIGATION_RECORD"] as const;
  const docs = await prisma.evidence.findMany({
    where: { caseId, legalCategory: { in: [...cats] } },
    select: { id: true, legalCategory: true, relatedDocumentIds: true, legalTags: true, exhibitLabel: true },
  });
  if (docs.length < 2) return { linked: 0, documentCount: docs.length };

  const allIds = docs.map((d) => d.id);
  let linked = 0;
  for (const d of docs) {
    const merged = new Set([...d.relatedDocumentIds, ...allIds.filter((id) => id !== d.id)]);
    const next = Array.from(merged);
    if (next.length === d.relatedDocumentIds.length) continue;
    const tags = new Set(d.legalTags ?? []);
    tags.add("AUTO_FIR_PACK_LINK");
    await prisma.evidence.update({
      where: { id: d.id },
      data: { relatedDocumentIds: next, legalTags: Array.from(tags) },
    });
    linked++;
  }
  return { linked, documentCount: docs.length, packCategories: cats };
}

export async function autoAssignMissingExhibitLabels(caseId: string) {
  const pending = await prisma.evidence.findMany({
    where: {
      caseId,
      documentStatus: { in: ["APPROVED_FOR_COURT", "UNDER_REVIEW", "SEALED"] },
      OR: [{ exhibitLabel: null }, { exhibitLabel: "" }],
    },
    select: { id: true, legalCategory: true },
    orderBy: { createdAt: "asc" },
  });
  let assigned = 0;
  let seq = await prisma.evidence.count({
    where: { caseId, NOT: [{ exhibitLabel: null }, { exhibitLabel: "" }] },
  });
  for (const d of pending) {
    seq += 1;
    const label =
      d.legalCategory === "EXHIBIT"
        ? `Exhibit P-${seq}`
        : `Annexure ${String.fromCharCode(64 + Math.min(seq, 26))}-${seq}`;
    const docRow = await prisma.evidence.findUnique({
      where: { id: d.id },
      select: { legalTags: true },
    });
    const tags = new Set(docRow?.legalTags ?? []);
    tags.add("AUTO_EXHIBIT_LABEL");
    await prisma.evidence.update({
      where: { id: d.id },
      data: {
        exhibitLabel: label,
        legalTags: Array.from(tags),
      },
    });
    assigned++;
  }
  return { assigned };
}

export async function buildCourtBundleManifest(caseId: string) {
  const docs = await prisma.evidence.findMany({
    where: {
      caseId,
      documentStatus: { in: ["APPROVED_FOR_COURT", "SEALED"] },
    },
    select: {
      id: true,
      fileName: true,
      registerNumber: true,
      exhibitLabel: true,
      sha256Hash: true,
      legalCategory: true,
      documentStatus: true,
      bsaCertifiedAt: true,
      ioCertifiedAt: true,
      prosecutionCertifiedAt: true,
      electronicSealId: true,
    },
    orderBy: { registerNumber: "asc" },
  });
  return {
    manifestType: "MHA_COURT_BUNDLE_SIH26190",
    caseId,
    generatedAt: new Date().toISOString(),
    documentCount: docs.length,
    documents: docs,
    productionReady: docs.every(
      (d) => d.ioCertifiedAt && d.prosecutionCertifiedAt && (d.documentStatus === "SEALED" || d.bsaCertifiedAt)
    ),
  };
}

export async function assessPlatformReliabilityForLegal(sampleEvidencePaths: string[] = []) {
  const checks: Record<string, { ok: boolean; latencyMs?: number; detail?: string }> = {};

  const pg0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = { ok: true, latencyMs: Date.now() - pg0 };
  } catch {
    checks.postgres = { ok: false };
  }

  const r0 = Date.now();
  try {
    const pong = await getRedis().ping();
    checks.redis = { ok: pong === "PONG", latencyMs: Date.now() - r0 };
  } catch {
    checks.redis = { ok: false };
  }

  const s3Endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
  const m0 = Date.now();
  try {
    const res = await fetch(`${s3Endpoint}/minio/health/live`, { signal: AbortSignal.timeout(3000) });
    checks.minio = { ok: res.ok, latencyMs: Date.now() - m0 };
  } catch {
    checks.minio = { ok: false };
  }

  let storageSamplesOk = 0;
  let storageSamples = 0;
  for (const key of sampleEvidencePaths.slice(0, 5)) {
    storageSamples += 1;
    if (await fileExists(key)) storageSamplesOk += 1;
  }
  if (storageSamples > 0) {
    checks.evidenceObjects = {
      ok: storageSamplesOk === storageSamples,
      detail: `${storageSamplesOk}/${storageSamples} sample objects reachable`,
    };
  }

  const weights = Object.values(checks);
  const score = weights.length
    ? Math.round((weights.filter((c) => c.ok).length / weights.length) * 100)
    : 0;

  return {
    psAlignment: "SIH26190",
    theme: "Smart Automation",
    reliabilityScore: score,
    status: score >= 80 ? "operational" : score >= 50 ? "degraded" : "critical",
    checks,
    automationEngine: "legal-automation-engine/v1",
  };
}

async function runIntegrityRemediation(caseId: string): Promise<AutomationStep[]> {
  const verify = await verifyCaseDocumentBundle(caseId);
  const failed = verify.results?.filter((r) => !r.verified) ?? [];
  let alertsCreated = 0;
  for (const f of failed.slice(0, 20)) {
    await prisma.alert.create({
      data: {
        type: "LEGAL_DOCUMENT_REVIEW",
        title: "Integrity remediation required",
        message: `Document ${f.fileName ?? f.evidenceId} failed hash/ledger verification`,
        caseId,
        confidence: 0.95,
        metadata: { evidenceId: f.evidenceId, playbook: "integrity_remediation_sweep" },
      },
    });
    alertsCreated++;
  }
  return [
    {
      id: "verify_bundle",
      ok: failed.length === 0,
      detail: { checked: verify.results?.length ?? 0, failed: failed.length },
    },
    { id: "raise_alerts", ok: true, detail: { alertsCreated } },
  ];
}

export async function runLegalPlaybook(params: {
  playbookId: LegalPlaybookId | string;
  caseId?: string;
  caseIds?: string[];
  userId?: string;
}): Promise<{
  playbookId: string;
  status: string;
  steps: AutomationStep[];
  summary: Record<string, unknown>;
  runId: string;
}> {
  const steps: AutomationStep[] = [];
  const summary: Record<string, unknown> = { psAlignment: "SIH26190" };

  try {
    if (params.playbookId === "org_daily_compliance") {
      const caseIds = params.caseIds ?? [];
      const scan = await runRetentionComplianceScan(caseIds);
      steps.push({ id: "retention_scan", ok: true, detail: scan });
      const metrics = await buildLegalCommandCenterMetrics(caseIds);
      steps.push({ id: "command_metrics", ok: true, detail: { documents: metrics.totals.documents } });
      let dupCases = 0;
      let dupGroups = 0;
      for (const cid of caseIds.slice(0, 50)) {
        const d = await findDuplicateHashesInCase(cid);
        if (d.duplicateGroups > 0) {
          dupCases++;
          dupGroups += d.duplicateGroups;
          await prisma.alert.create({
            data: {
              type: "LEGAL_DOCUMENT_REVIEW",
              title: "Duplicate hash detected (automation)",
              message: `${d.duplicateGroups} duplicate SHA-256 group(s) in case — review before court production`,
              caseId: cid,
              confidence: 0.85,
              metadata: { duplicateGroups: d.duplicateGroups, playbook: "org_daily_compliance" },
            },
          });
        }
      }
      steps.push({ id: "duplicate_watchdog", ok: true, detail: { dupCases, dupGroups } });
      summary.scan = scan;
      summary.metrics = metrics.totals;
      summary.duplicateWatchdog = { dupCases, dupGroups };
    } else {
      const caseId = params.caseId;
      if (!caseId) throw new Error("caseId required for case-scoped playbook");

      if (params.playbookId === "mha_one_click_court_file") {
        await ensureCaseRegisterNumbers(caseId);
        steps.push({ id: "register_numbers", ok: true });

        const bulk = await bulkSendDocumentsToReview(caseId);
        steps.push({ id: "bulk_review", ok: true, detail: bulk });

        const link = await autoLinkInvestigationDocumentPack(caseId);
        steps.push({ id: "fir_pack_link", ok: true, detail: link });

        const exhibits = await autoAssignMissingExhibitLabels(caseId);
        steps.push({ id: "exhibit_labels", ok: true, detail: exhibits });

        const verify = await verifyCaseDocumentBundle(caseId);
        steps.push({
          id: "integrity_verify",
          ok: (verify.results?.filter((r) => !r.verified).length ?? 0) === 0,
          detail: { failed: verify.results?.filter((r) => !r.verified).length ?? 0 },
        });

        const court = await runCourtPrepPack(caseId);
        steps.push({
          id: "court_prep",
          ok: true,
          detail: {
            readinessScore: court.readiness.score,
            integrityOk: court.integrity.allVerified,
          },
        });

        const readiness = await buildCourtReadinessChecklist(caseId);
        summary.readinessScore = readiness.score;
        summary.courtPrep = court;
      } else if (params.playbookId === "integrity_remediation_sweep") {
        steps.push(...(await runIntegrityRemediation(caseId)));
      } else if (params.playbookId === "smart_fir_pack_linker") {
        const link = await autoLinkInvestigationDocumentPack(caseId);
        steps.push({ id: "fir_pack_link", ok: true, detail: link });
        summary.linked = link.linked;
      } else {
        throw new Error(`Unknown playbook: ${params.playbookId}`);
      }
    }

    const failed = steps.some((s) => !s.ok);
    const status = failed ? "PARTIAL" : "COMPLETED";
    const run = await recordAutomationRun({
      playbookId: params.playbookId,
      caseId: params.caseId,
      userId: params.userId,
      status,
      steps,
      summary,
    });

    const webhook = await dispatchLegalAutomationWebhook(
      { playbookId: params.playbookId, runId: run.id, status, summary },
      params.userId
    );
    summary.webhook = webhook;

    return { playbookId: params.playbookId, status, steps, summary, runId: run.id };
  } catch (e) {
    const err = e instanceof Error ? e.message : "playbook failed";
    steps.push({ id: "fatal", ok: false, error: err });
    const run = await recordAutomationRun({
      playbookId: params.playbookId,
      caseId: params.caseId,
      userId: params.userId,
      status: "FAILED",
      steps,
      summary: { error: err },
    });
    return { playbookId: params.playbookId, status: "FAILED", steps, summary: { error: err }, runId: run.id };
  }
}

export async function listRecentAutomationRuns(limit = 15) {
  return prisma.legalAutomationRun.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      case: { select: { caseNumber: true } },
      user: { select: { name: true, email: true } },
    },
  });
}
