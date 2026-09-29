import { prisma } from "./db";
import { resolvePlaybook, type PlaybookModule } from "./crime-playbooks";
import { createCdrAlerts } from "./cdr-intelligence";
import { createFinancialAlerts } from "./financial-intelligence";
import { createGeoAlerts, geocodeCaseLocations } from "./geo-intelligence";
import { createConflictAlerts } from "./conflict-radar";
import { createCyberAlerts } from "./cyber-intelligence";
import { createWomenSafetyAlerts } from "./women-safety-intel";
import { detectPostCrimeSilence } from "./silence-detector";
import { findMoTwins } from "./mo-twin";
import { computeInvestigationHealth } from "./investigation-health";
import { generateCaseBrief } from "./case-brief";

export interface AutopilotStageResult {
  stage: string;
  module?: PlaybookModule | string;
  ok: boolean;
  detail: string;
  created?: number;
  error?: string;
}

export interface AutopilotResult {
  caseId: string;
  playbookId: string;
  playbookLabel: string;
  playbookDescription: string;
  modules: PlaybookModule[];
  stages: AutopilotStageResult[];
  healthScore: number | null;
  healthGaps: string[];
  briefSummary: string | null;
  totalAlertsCreated: number;
  completedAt: string;
}

async function safeStage(
  stage: string,
  module: string | undefined,
  fn: () => Promise<{ detail: string; created?: number }>
): Promise<AutopilotStageResult> {
  try {
    const r = await fn();
    return { stage, module, ok: true, detail: r.detail, created: r.created };
  } catch (err) {
    return {
      stage,
      module,
      ok: false,
      detail: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Playbook-driven investigation autopilot. Never throws away partial success —
 * each stage is isolated; failures are recorded and later stages still run.
 */
export async function runInvestigationAutopilot(
  caseId: string
): Promise<AutopilotResult> {
  const caseRow = await prisma.case.findUnique({
    where: { id: caseId },
    select: { crimeType: true, caseNumber: true },
  });

  const playbook = resolvePlaybook(caseRow?.crimeType ?? "");
  const modules = new Set(playbook.modules);
  const stages: AutopilotStageResult[] = [];
  let totalAlertsCreated = 0;

  stages.push({
    stage: "resolve_playbook",
    ok: true,
    detail: `Using playbook ${playbook.id} (${playbook.label}) with modules: ${playbook.modules.join(", ")}`,
  });

  if (modules.has("cdr")) {
    const s = await safeStage("create_cdr_alerts", "cdr", async () => {
      const created = await createCdrAlerts(caseId);
      return { detail: `CDR alerts created: ${created}`, created };
    });
    stages.push(s);
    if (s.ok && s.created) totalAlertsCreated += s.created;
  }

  if (modules.has("financial")) {
    const s = await safeStage("create_financial_alerts", "financial", async () => {
      const created = await createFinancialAlerts(caseId);
      return { detail: `Financial alerts created: ${created}`, created };
    });
    stages.push(s);
    if (s.ok && s.created) totalAlertsCreated += s.created;
  }

  if (modules.has("geo")) {
    const s = await safeStage("geocode_and_geo_alerts", "geo", async () => {
      const geocoded = await geocodeCaseLocations(caseId).catch(() => 0);
      const created = await createGeoAlerts(caseId);
      return {
        detail: `Geocoded ${geocoded} location(s); geo alerts created: ${created}`,
        created,
      };
    });
    stages.push(s);
    if (s.ok && s.created) totalAlertsCreated += s.created;
  }

  if (modules.has("conflicts")) {
    const s = await safeStage("create_conflict_alerts", "conflicts", async () => {
      const created = await createConflictAlerts(caseId);
      return { detail: `Conflict alerts created: ${created}`, created };
    });
    stages.push(s);
    if (s.ok && s.created) totalAlertsCreated += s.created;
  }

  if (modules.has("cyber")) {
    const s = await safeStage("create_cyber_alerts", "cyber", async () => {
      const created = await createCyberAlerts(caseId);
      return { detail: `Cyber alerts created: ${created}`, created };
    });
    stages.push(s);
    if (s.ok && s.created) totalAlertsCreated += s.created;
  }

  if (modules.has("women_safety")) {
    const s = await safeStage("create_women_safety_alerts", "women_safety", async () => {
      const created = await createWomenSafetyAlerts(caseId);
      return { detail: `Women-safety alerts created: ${created}`, created };
    });
    stages.push(s);
    if (s.ok && s.created) totalAlertsCreated += s.created;
  }

  if (modules.has("silence")) {
    const s = await safeStage("silence_detector", "silence", async () => {
      const result = await detectPostCrimeSilence(caseId);
      const n = Array.isArray((result as { silentActors?: unknown[] }).silentActors)
        ? (result as { silentActors: unknown[] }).silentActors.length
        : 0;
      return { detail: `Post-crime silence actors flagged: ${n}`, created: n };
    });
    stages.push(s);
  }

  if (modules.has("mo_twin")) {
    const s = await safeStage("mo_twin_search", "mo_twin", async () => {
      const result = await findMoTwins(caseId);
      const n = Array.isArray(result.twins) ? result.twins.length : 0;
      return { detail: `MO twin candidates: ${n}`, created: n };
    });
    stages.push(s);
  }

  // Knowledge index — best effort
  const indexStage = await safeStage("index_case_knowledge", "brief", async () => {
    const { indexCaseKnowledge } = await import("./copilot-rag");
    const n = await indexCaseKnowledge(caseId);
    return { detail: `Knowledge chunks indexed: ${n}`, created: n };
  });
  stages.push(indexStage);

  let healthScore: number | null = null;
  let healthGaps: string[] = [];
  const healthStage = await safeStage("investigation_health", undefined, async () => {
    const h = await computeInvestigationHealth(caseId);
    healthScore = h.score;
    healthGaps = h.gaps;
    return {
      detail: `Health score ${h.score}/100; gaps: ${h.gaps.length}`,
    };
  });
  stages.push(healthStage);

  let briefSummary: string | null = null;
  if (modules.has("brief")) {
    const briefStage = await safeStage("generate_case_brief", "brief", async () => {
      const brief = await generateCaseBrief(caseId);
      briefSummary = brief.summary;
      return { detail: `Brief generated (${brief.source})` };
    });
    stages.push(briefStage);
  }

  if (modules.has("report")) {
    const reportStage = await safeStage("report_status", "report", async () => {
      const count = await prisma.report.count({ where: { caseId } });
      return {
        detail:
          count > 0
            ? `${count} report(s) on file — open Reports tab to download`
            : "No PDF yet — use Reports tab (Manual) or generate after review",
        created: count,
      };
    });
    stages.push(reportStage);
  }

  const workStages = stages.filter((s) => s.stage !== "resolve_playbook");
  const okCount = workStages.filter((s) => s.ok).length;
  stages.push({
    stage: "complete",
    ok: okCount > 0 || workStages.length === 0,
    detail: `Autopilot finished for ${caseRow?.caseNumber ?? caseId}; ${okCount}/${workStages.length} stages ok; ${totalAlertsCreated} alert(s) created`,
    created: totalAlertsCreated,
  });

  return {
    caseId,
    playbookId: playbook.id,
    playbookLabel: playbook.label,
    playbookDescription: playbook.description,
    modules: playbook.modules,
    stages,
    healthScore,
    healthGaps,
    briefSummary,
    totalAlertsCreated,
    completedAt: new Date().toISOString(),
  };
}
