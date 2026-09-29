import { prisma } from "./db";
import { resolvePlaybook } from "./crime-playbooks";

/**
 * Charge-sheet outline assist — draft structure (particulars, facts, sections,
 * annexures) with IPC/IT Act style hints from crime family. Assistive only;
 * Investigating Officer / Public Prosecutor must review before any filing.
 */

export interface ChargesheetSection {
  id: string;
  heading: string;
  bullets: string[];
  statuteHints: string[];
}

export interface ChargesheetOutline {
  disclaimer: string;
  caseNumber: string;
  crimeType: string;
  sections: ChargesheetSection[];
  entityAnnex: Array<{ type: string; value: string; evidenceId?: string | null }>;
  computedAt: string;
}

/** Map crime families → suggested IPC / IT Act style references (assistive only). */
function statuteHintsFor(crimeType: string, entityTypes: Set<string>): string[] {
  const lower = crimeType.toLowerCase();
  const hints: string[] = [];

  if (/murder|homicide/.test(lower)) hints.push("IPC 302 (murder) — draft only");
  if (/assault|hurt|violent/.test(lower)) hints.push("IPC 323/324/325 — draft only");
  if (/theft|stolen|vehicle/.test(lower)) hints.push("IPC 379/380 — draft only");
  if (/kidnap|abduct|traffick|missing/.test(lower)) hints.push("IPC 363/370 — draft only");
  if (/stalk|harass|women|dowry|domestic/.test(lower)) {
    hints.push("IPC 354D (stalking) — draft only");
    hints.push("IPC 498A / DV Act — draft only if facts support");
  }
  if (/narcotic|ndps|drug/.test(lower)) hints.push("NDPS Act provisions — draft only");
  if (/fraud|cheat|upi|phishing|otp|cyber|online/.test(lower)) {
    hints.push("IPC 420 (cheating) — draft only");
    hints.push("IT Act 66C/66D — draft only");
  }
  if (/crypto|wallet/.test(lower) || entityTypes.has("CRYPTO_WALLET")) {
    hints.push("IT Act / PMLA interface — draft only");
  }
  if (entityTypes.has("DOMAIN") || entityTypes.has("EMAIL")) {
    hints.push("IT Act 66D (impersonation) — draft only");
  }
  if (hints.length === 0) {
    hints.push("Relevant IPC/special-act sections — to be confirmed by IO/PP");
  }
  return hints;
}

/**
 * AI-assisted charge-sheet outline from crimeType + entities. Labelled as draft.
 */
export async function buildChargesheetOutline(
  caseId: string
): Promise<ChargesheetOutline> {
  const [caseRow, entities, alerts, evidence, notes] = await Promise.all([
    prisma.case.findUnique({
      where: { id: caseId },
      select: {
        caseNumber: true,
        crimeType: true,
        location: true,
        incidentDate: true,
        description: true,
        policeStation: true,
      },
    }),
    prisma.entity.findMany({
      where: { caseId, mergedIntoId: null },
      select: { type: true, normalizedValue: true, evidenceId: true },
      take: 100,
    }),
    prisma.alert.findMany({
      where: { caseId, status: { in: ["NEW", "ACKNOWLEDGED", "INVESTIGATING"] } },
      select: { type: true, title: true, message: true },
      take: 20,
    }),
    prisma.evidence.findMany({
      where: { caseId },
      select: { type: true, fileName: true, sha256Hash: true },
    }),
    prisma.caseNote.findMany({
      where: { caseId },
      select: { content: true },
      take: 10,
    }),
  ]);

  const crimeType = caseRow?.crimeType ?? "Unknown";
  const entityTypes = new Set(entities.map((e) => e.type));
  const playbook = resolvePlaybook(crimeType);
  const statutes = statuteHintsFor(crimeType, entityTypes);

  const persons = entities.filter((e) => e.type === "PERSON");
  const phones = entities.filter((e) => e.type === "PHONE");
  const money = entities.filter((e) => e.type === "UPI" || e.type === "BANK_ACCOUNT");
  const vehicles = entities.filter((e) => e.type === "VEHICLE");

  const sections: ChargesheetSection[] = [
    {
      id: "header",
      heading: "1. Case particulars (draft)",
      bullets: [
        `Case number: ${caseRow?.caseNumber ?? caseId}`,
        `Crime type (recorded): ${crimeType}`,
        `Police station: ${caseRow?.policeStation ?? "—"}`,
        `Incident date: ${caseRow?.incidentDate?.toISOString().slice(0, 10) ?? "—"}`,
        `Location: ${caseRow?.location ?? "—"}`,
        `Playbook routing: ${playbook.label}`,
      ],
      statuteHints: [],
    },
    {
      id: "fir-facts",
      heading: "2. Facts from FIR / description (draft)",
      bullets: [
        caseRow?.description?.slice(0, 500) || "No case description on file — insert FIR narrative.",
        ...notes.slice(0, 3).map((n) => `Note excerpt: ${n.content.slice(0, 200)}`),
      ],
      statuteHints: [],
    },
    {
      id: "accused-poi",
      heading: "3. Persons / identifiers of interest (draft)",
      bullets: [
        ...(persons.length
          ? persons.slice(0, 10).map((p) => `Person: ${p.normalizedValue}`)
          : ["No PERSON entities extracted yet"]),
        ...phones.slice(0, 8).map((p) => `Phone: ${p.normalizedValue}`),
        ...money.slice(0, 8).map((m) => `${m.type}: ${m.normalizedValue}`),
        ...vehicles.slice(0, 5).map((v) => `Vehicle: ${v.normalizedValue}`),
      ],
      statuteHints: statutes.slice(0, 2),
    },
    {
      id: "digital-leads",
      heading: "4. Digital leads & alerts (draft)",
      bullets:
        alerts.length > 0
          ? alerts.slice(0, 12).map((a) => `[${a.type}] ${a.title}: ${a.message.slice(0, 160)}`)
          : ["No open alerts — run Autopilot / re-analyze before charge drafting"],
      statuteHints: entityTypes.has("DOMAIN") || /cyber|phish|upi/i.test(crimeType) ? ["IT Act 66C/66D — draft only"] : [],
    },
    {
      id: "evidence-list",
      heading: "5. Documents & electronic evidence (draft)",
      bullets: evidence.length
        ? evidence.map(
            (e) => `${e.type}: ${e.fileName} (hash ${String(e.sha256Hash ?? "").slice(0, 16)}…)`
          )
        : ["No evidence uploaded"],
      statuteHints: ["Indian Evidence Act — electronic records (draft checklist)"],
    },
    {
      id: "charges",
      heading: "6. Suggested charge framing (AI-assisted draft)",
      bullets: [
        "THIS IS AN AI-ASSISTED DRAFT — not legal advice. IO/PP must verify facts and sections.",
        ...statutes.map((s) => `Consider: ${s}`),
        "List specific overt acts with date/time/place per accused after verification.",
        "Attach CDR/bank certificates under appropriate statutory form.",
      ],
      statuteHints: statutes,
    },
    {
      id: "next",
      heading: "7. Further investigation suggested (draft)",
      bullets: [
        persons.length === 0 ? "Obtain identity particulars / 41A notice materials as applicable" : "Verify identity documents for listed persons",
        phones.length > 0 ? "Seek subscriber details / CAF for listed phones" : "Upload CDR if communication relevant",
        money.length > 0 ? "Obtain account statements / UPI logs for listed accounts" : "Upload bank/UPI evidence if financial motive",
        "Preserve chain of custody for all electronic exhibits",
      ],
      statuteHints: [],
    },
  ];

  return {
    disclaimer:
      "AI-assisted draft only. Not a filed charge-sheet. Does not constitute legal advice or a finding of guilt.",
    caseNumber: caseRow?.caseNumber ?? caseId,
    crimeType,
    sections,
    entityAnnex: entities.slice(0, 80).map((e) => ({
      type: e.type,
      value: e.normalizedValue,
      evidenceId: e.evidenceId,
    })),
    computedAt: new Date().toISOString(),
  };
}
