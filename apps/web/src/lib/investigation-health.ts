import { prisma } from "./db";
import { resolvePlaybook, type PlaybookModule } from "./crime-playbooks";

export interface InvestigationHealthResult {
  score: number;
  gaps: string[];
  modules: Record<string, boolean>;
  playbookId: string;
  playbookLabel: string;
  playbookDescription: string;
  playbookModules: PlaybookModule[];
  computedAt: string;
}

const MODULE_LABELS: Record<PlaybookModule, string> = {
  cdr: "CDR / communication analysis",
  financial: "Financial / transaction analysis",
  geo: "Geo / location events",
  graph: "Entity graph / relationships",
  cyber: "Cyber intelligence signals",
  women_safety: "Women-safety indicators",
  conflicts: "Evidence conflict checks",
  mo_twin: "MO fingerprint / twin match",
  brief: "Case brief",
  silence: "Post-crime silence analysis",
  report: "Investigation report",
};

/**
 * Score investigation completeness (0–100) against the crime-type playbook.
 * Gaps are grounded only in missing evidence / empty modules — no invented facts.
 */
export async function computeInvestigationHealth(
  caseId: string
): Promise<InvestigationHealthResult> {
  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      crimeType: true,
      description: true,
      incidentDate: true,
      location: true,
      _count: {
        select: {
          evidence: true,
          entities: true,
          cdrRecords: true,
          transactions: true,
          locations: true,
          alerts: true,
          notes: true,
          reports: true,
          knowledgeChunks: true,
        },
      },
    },
  });

  if (!caseRow) {
    return {
      score: 0,
      gaps: ["Case not found"],
      modules: {},
      playbookId: "generic",
      playbookLabel: "General investigation",
      playbookDescription: "Safe full suite when crime type is unclear",
      playbookModules: [],
      computedAt: new Date().toISOString(),
    };
  }

  const playbook = resolvePlaybook(caseRow.crimeType);
  const counts = caseRow._count;

  const pendingEvidence = await prisma.evidence.count({
    where: { caseId, ingestionStatus: { in: ["PENDING", "PROCESSING", "FAILED"] } },
  });
  const openMatches = await prisma.entityMatch.count({
    where: {
      status: "PENDING",
      OR: [{ entityA: { caseId } }, { entityB: { caseId } }],
    },
  });
  const relationships = await prisma.relationship.count({
    where: { sourceEntity: { caseId } },
  });

  const cyberEntityTypes = ["EMAIL", "DOMAIN", "IP_ADDRESS", "DEVICE", "CRYPTO_WALLET", "SOCIAL_HANDLE"] as const;
  const cyberEntityCount = await prisma.entity.count({
    where: { caseId, mergedIntoId: null, type: { in: [...cyberEntityTypes] } },
  });

  const conflictAlerts = await prisma.alert.count({
    where: {
      caseId,
      OR: [
        { type: "INTEGRITY_MISMATCH" },
        {
          type: "COMMON_LOCATION",
          metadata: { path: ["feature"], equals: "EVIDENCE_CONFLICT" },
        },
      ],
    },
  });

  const womenSafetyAlerts = await prisma.alert.count({
    where: {
      caseId,
      metadata: { path: ["feature"], equals: "WOMEN_SAFETY" },
    },
  });

  const modules: Record<string, boolean> = {
    evidence: counts.evidence > 0,
    entities: counts.entities > 0,
    cdr: counts.cdrRecords > 0,
    financial: counts.transactions > 0,
    geo: counts.locations > 0,
    graph: relationships > 0,
    cyber: cyberEntityCount > 0,
    women_safety: womenSafetyAlerts > 0 || counts.cdrRecords > 0,
    conflicts: conflictAlerts > 0,
    mo_twin: counts.entities >= 3,
    brief: Boolean(caseRow.description) || counts.notes > 0,
    silence: Boolean(caseRow.incidentDate) && (counts.cdrRecords > 0 || counts.transactions > 0),
    report: counts.reports > 0,
    knowledge: counts.knowledgeChunks > 0,
    alerts: counts.alerts > 0,
  };

  const gaps: string[] = [];
  if (counts.evidence === 0) gaps.push("No evidence uploaded");
  if (pendingEvidence > 0) gaps.push(`${pendingEvidence} evidence item(s) still pending/failed ingestion`);
  if (!caseRow.incidentDate) gaps.push("Incident date not set");
  if (!caseRow.location) gaps.push("Case location not set");
  if (!caseRow.description) gaps.push("Case description empty");
  if (counts.entities === 0) gaps.push("No entities extracted");
  if (openMatches > 0) gaps.push(`${openMatches} pending entity match(es) to review`);

  for (const mod of playbook.modules) {
    const ready = modules[mod] === true;
    if (!ready) {
      gaps.push(`Playbook module not ready: ${MODULE_LABELS[mod] ?? mod}`);
    }
  }

  // Base from playbook module coverage
  const required = playbook.modules;
  const covered = required.filter((m) => modules[m]).length;
  let score = required.length > 0 ? Math.round((covered / required.length) * 70) : 50;

  // Bonus for foundational completeness
  if (counts.evidence > 0) score += 5;
  if (counts.entities >= 3) score += 5;
  if (counts.alerts > 0) score += 5;
  if (counts.reports > 0) score += 5;
  if (counts.knowledgeChunks > 0) score += 5;
  if (caseRow.incidentDate && caseRow.description) score += 5;

  // Penalties
  if (pendingEvidence > 0) score -= Math.min(15, pendingEvidence * 5);
  if (openMatches > 3) score -= 5;

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    gaps,
    modules,
    playbookId: playbook.id,
    playbookLabel: playbook.label,
    playbookDescription: playbook.description,
    playbookModules: playbook.modules,
    computedAt: new Date().toISOString(),
  };
}
