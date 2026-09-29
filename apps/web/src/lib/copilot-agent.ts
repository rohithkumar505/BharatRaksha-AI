/**
 * Tool-calling agent for Copilot / Voice — additive; falls back to RAG when no tool matches.
 */
import { createCdrAlerts, analyzeCdrForCase } from "./cdr-intelligence";
import { createFinancialAlerts, analyzeFinancialForCase } from "./financial-intelligence";
import { createGeoAlerts, geocodeCaseLocations } from "./geo-intelligence";
import { analyzeCyberIntel, createCyberAlerts } from "./cyber-intelligence";
import { analyzeWomenSafety, createWomenSafetyAlerts } from "./women-safety-intel";
import { analyzeEvidenceConflicts, createConflictAlerts } from "./conflict-radar";
import { getCluesAndHypotheses } from "./clue-hypothesis";
import { detectPostCrimeSilence } from "./silence-detector";
import { buildMirrorIdentityScoreboard } from "./mirror-identity";
import { findMoTwins } from "./mo-twin";
import { generateCaseBrief } from "./case-brief";
import { runInvestigationAutopilot } from "./investigation-autopilot";
import { buildStoryCinema } from "./story-cinema";
import { buildChargesheetOutline } from "./chargesheet-assist";
import { buildCourtPackManifest } from "./court-pack";

export type AgentToolResult = {
  handled: boolean;
  tool?: string;
  answer: string;
  data?: unknown;
};

type Tool = {
  id: string;
  patterns: RegExp[];
  run: (caseId: string) => Promise<{ answer: string; data?: unknown }>;
};

const TOOLS: Tool[] = [
  {
    id: "run_autopilot",
    patterns: [/autopilot/i, /auto\s*pilot/i, /poora\s*analyze/i, /full\s*analy/i],
    run: async (caseId) => {
      const r = await runInvestigationAutopilot(caseId);
      return {
        answer: `Autopilot finished with playbook ${r.playbookLabel}. Stages ok: ${r.stages.filter((s) => s.ok).length}/${r.stages.length}. Health ${r.healthScore ?? "—"}. Alerts created: ${r.totalAlertsCreated}.`,
        data: r,
      };
    },
  },
  {
    id: "run_cdr",
    patterns: [/\bcdr\b/i, /call\s*detail/i, /communication/i, /phone\s*analy/i],
    run: async (caseId) => {
      const n = await createCdrAlerts(caseId);
      const a = await analyzeCdrForCase(caseId);
      return { answer: `CDR analysis complete. Alerts created: ${n}. Frequent contacts: ${a.frequentContacts?.length ?? 0}.`, data: a };
    },
  },
  {
    id: "run_financial",
    patterns: [/\baml\b/i, /financial/i, /money\s*flow/i, /bank\s*txn/i, /upi/i],
    run: async (caseId) => {
      const n = await createFinancialAlerts(caseId);
      const a = await analyzeFinancialForCase(caseId);
      return { answer: `Financial/AML analysis complete. Alerts: ${n}.`, data: a };
    },
  },
  {
    id: "run_geo",
    patterns: [/\bgeo\b/i, /map\b/i, /location/i, /tower/i, /timeline/i],
    run: async (caseId) => {
      const geocoded = await geocodeCaseLocations(caseId).catch(() => 0);
      const alerts = await createGeoAlerts(caseId).catch(() => 0);
      return { answer: `Geo analysis ran. Geocoded: ${geocoded}. Alerts: ${alerts}.`, data: { geocoded, alerts } };
    },
  },
  {
    id: "run_cyber",
    patterns: [/cyber/i, /phishing/i, /sim\s*swap/i, /mule/i, /crypto/i],
    run: async (caseId) => {
      const n = await createCyberAlerts(caseId);
      const a = await analyzeCyberIntel(caseId);
      return { answer: `Cyber intel complete. Alerts: ${n}.`, data: a };
    },
  },
  {
    id: "run_women_safety",
    patterns: [/women\s*safety/i, /stalking/i, /harassment/i, /trafficking/i],
    run: async (caseId) => {
      const n = await createWomenSafetyAlerts(caseId);
      const a = await analyzeWomenSafety(caseId);
      return { answer: `Women-safety analysis complete. Alerts: ${n}.`, data: a };
    },
  },
  {
    id: "get_conflicts",
    patterns: [/conflict/i, /alibi/i, /contradict/i],
    run: async (caseId) => {
      const n = await createConflictAlerts(caseId);
      const c = await analyzeEvidenceConflicts(caseId);
      return { answer: `Found ${(c as { conflicts?: unknown[] }).conflicts?.length ?? 0} conflicts. Alerts: ${n}.`, data: c };
    },
  },
  {
    id: "get_clues",
    patterns: [/clue/i, /hypothesis/i, /theory/i, /ho\s*sakta/i],
    run: async (caseId) => {
      const d = await getCluesAndHypotheses(caseId);
      const clues = (d as { clues?: Array<{ title: string }> }).clues ?? [];
      return {
        answer: clues.length
          ? `Top clues:\n${clues.slice(0, 5).map((c, i) => `${i + 1}. ${c.title}`).join("\n")}`
          : "No strong clues yet — upload more evidence or run Autopilot.",
        data: d,
      };
    },
  },
  {
    id: "silence",
    patterns: [/silence/i, /quiet/i, /chup/i],
    run: async (caseId) => {
      const d = await detectPostCrimeSilence(caseId);
      return { answer: "Post-crime silence analysis ready.", data: d };
    },
  },
  {
    id: "mirror",
    patterns: [/mirror/i, /identity\s*score/i, /fusion/i],
    run: async (caseId) => {
      const d = await buildMirrorIdentityScoreboard(caseId);
      return { answer: "Mirror identity scoreboard built.", data: d };
    },
  },
  {
    id: "mo_twins",
    patterns: [/mo\s*twin/i, /similar\s*case/i, /modus/i],
    run: async (caseId) => {
      const d = await findMoTwins(caseId);
      return { answer: "MO twin search complete.", data: d };
    },
  },
  {
    id: "brief",
    patterns: [/brief/i, /summary/i, /samjhao/i, /summar/i],
    run: async (caseId) => {
      const d = await generateCaseBrief(caseId);
      return { answer: (d as { summary?: string }).summary ?? "Brief generated.", data: d };
    },
  },
  {
    id: "cinema",
    patterns: [/cinema/i, /story/i, /kahani/i],
    run: async (caseId) => {
      const d = await buildStoryCinema(caseId);
      return { answer: "Story cinema beats ready.", data: d };
    },
  },
  {
    id: "chargesheet",
    patterns: [/charge\s*sheet/i, /chargesheet/i, /ipc/i],
    run: async (caseId) => {
      const d = await buildChargesheetOutline(caseId);
      return { answer: "Charge-sheet outline (AI-assisted draft) ready — review before use.", data: d };
    },
  },
  {
    id: "court_pack",
    patterns: [/court\s*pack/i, /court\s*bundle/i],
    run: async (caseId) => {
      const d = await buildCourtPackManifest(caseId);
      return { answer: "Court pack manifest ready.", data: d };
    },
  },
  {
    id: "get_coach",
    patterns: [/coach/i, /next\s*step/i, /sikhao/i, /guide\s*me/i],
    run: async (caseId) => {
      const { getInvestigatorCoach } = await import("./investigator-coach");
      const d = await getInvestigatorCoach(caseId);
      const top = d.cards.slice(0, 3).map((c, i) => `${i + 1}. ${c.title}: ${c.nextStep}`).join("\n");
      return {
        answer: top
          ? `Coach cards (health ${d.healthScore}):\n${top}`
          : "No coach cards yet — run Autopilot first.",
        data: d,
      };
    },
  },
];

export async function tryRunCopilotAgent(caseId: string, query: string): Promise<AgentToolResult> {
  const q = query.trim();
  // Only act on imperative / tool-style commands so RAG Q&A stays intact
  // e.g. "Explain financial anomalies" → RAG; "financial analyze karo" → tool
  const isAction =
    /\b(chalao|karo|run|re-?analyze|analyze|check|scan|generate|banao|dikhao|do|start|execute|refresh|update)\b/i.test(
      q
    ) ||
    /^(autopilot|brief|clues?|hypothes|cyber|cdr|aml|financial|geo|map|silence|mirror|mo\b|court|charge|women|stalking|conflict|coach)\b/i.test(
      q
    );
  if (!isAction) {
    return { handled: false, answer: "" };
  }

  for (const tool of TOOLS) {
    if (tool.patterns.some((p) => p.test(q))) {
      const r = await tool.run(caseId);
      return { handled: true, tool: tool.id, answer: r.answer, data: r.data };
    }
  }
  return { handled: false, answer: "" };
}
