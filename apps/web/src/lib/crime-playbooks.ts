/**
 * Research-backed crime family playbooks (assistive routing — not legal advice).
 *
 * Grounding (public practice / literature):
 * - UPI/digital payment fraud: correlate victim→device/SIM→UPI→mule hop chains
 *   (bank + telecom timestamps), not bank trail alone.
 * - SIM-swap / OTP fraud: align CDR/SMS silence or port windows with txn OTP times.
 * - CDR/tower: call patterns, bursts, colocation; lawful production under BNSS s.94 style process
 *   (platform assists analysis of uploaded CDR only — does not fetch from telcos).
 * - Stalking/harassment: repeated contact, night density, proximity corridors from tower/geo.
 * - Trafficking/missing: multi-location hops + shared handler phones.
 * - AML: fan-in/out, smurfing, rapid movement, circular flows.
 *
 * Scores/alerts are investigative leads for officers to review.
 */
export type PlaybookModule =
  | "cdr"
  | "financial"
  | "geo"
  | "graph"
  | "cyber"
  | "women_safety"
  | "conflicts"
  | "mo_twin"
  | "brief"
  | "silence"
  | "report";

export interface CrimePlaybook {
  id: string;
  label: string;
  aliases: string[];
  modules: PlaybookModule[];
  description: string;
  rationale: string;
}

export const CRIME_PLAYBOOKS: CrimePlaybook[] = [
  {
    id: "cyber_financial",
    label: "Cyber financial / UPI fraud",
    aliases: [
      "upi",
      "cyber fraud",
      "cyber financial",
      "online fraud",
      "financial fraud",
      "phishing fraud",
      "otp fraud",
      "payment fraud",
      "digital payment",
      "cyber crime",
      "live smoke",
    ],
    modules: ["financial", "cyber", "cdr", "conflicts", "silence", "brief", "report"],
    description: "Mule chains, OTP/SIM-swap timing, CDR bursts, conflict checks",
    rationale: "UPI fraud forensics correlates bank hops with telecom/OTP windows and mule fan-out.",
  },
  {
    id: "phishing",
    label: "Phishing / social engineering",
    aliases: ["phishing", "spoof", "fake link", "smishing", "vishing", "social engineering"],
    modules: ["cyber", "cdr", "financial", "conflicts", "brief", "report"],
    description: "URL/domain risk, email intel, money movement",
    rationale: "Phishing cases pivot from lure URLs/domains to downstream payment or credential theft.",
  },
  {
    id: "crypto_fraud",
    label: "Crypto-linked fraud",
    aliases: ["crypto", "bitcoin", "wallet", "usdt", "cryptocurrency"],
    modules: ["cyber", "financial", "graph", "brief", "report"],
    description: "Wallet hops bridged to bank/UPI",
    rationale: "Crypto off-ramps often bridge wallets to UPI/bank mules — graph + cyber hop analysis.",
  },
  {
    id: "women_safety_stalking",
    label: "Stalking / harassment (women safety)",
    aliases: [
      "stalking",
      "harassment",
      "eve teasing",
      "women safety",
      "dowry",
      "domestic",
      "sexual harassment",
    ],
    modules: ["women_safety", "cdr", "geo", "conflicts", "silence", "brief", "report"],
    description: "Stalking patterns, escalation, proximity risk",
    rationale: "Stalking indicators use repeated CDR contact, night density, and geo proximity.",
  },
  {
    id: "trafficking_missing",
    label: "Trafficking / missing person",
    aliases: ["trafficking", "missing", "kidnap", "abduction", "human trafficking"],
    modules: ["women_safety", "cdr", "geo", "graph", "conflicts", "brief", "report"],
    description: "Multi-city hops, handler phones, last-seen timeline",
    rationale: "Missing/trafficking leads emphasize movement corridors and shared handler phones.",
  },
  {
    id: "organized",
    label: "Organized / gang crime",
    aliases: ["organized", "gang", "syndicate", "mafia", "organized crime"],
    modules: ["graph", "cdr", "financial", "geo", "mo_twin", "brief", "report"],
    description: "Communities, bridges, cross-case MO",
    rationale: "Organized crime work prioritizes network communities, bridges, and MO twins.",
  },
  {
    id: "narcotics",
    label: "Narcotics pattern",
    aliases: ["narcotics", "drugs", "ndps", "drug"],
    modules: ["cdr", "geo", "financial", "graph", "brief", "report"],
    description: "Colocation corridors and cash patterns",
    rationale: "Narcotics patterns often show co-location CDR/tower corridors plus cash movement.",
  },
  {
    id: "homicide_violent",
    label: "Homicide / violent crime",
    aliases: ["murder", "homicide", "assault", "violent", "ipc 302", "302"],
    modules: ["cdr", "geo", "conflicts", "silence", "graph", "brief", "report"],
    description: "Alibi conflicts, silence after incident, movement",
    rationale: "Violent crime timelines stress alibi conflict, post-incident silence, and movement.",
  },
  {
    id: "vehicle_theft",
    label: "Vehicle theft",
    aliases: ["vehicle", "auto theft", "car theft", "bike theft", "motor vehicle"],
    modules: ["geo", "cdr", "graph", "mo_twin", "brief", "report"],
    description: "Plate/entity links and hotspot MO",
    rationale: "Vehicle theft links plates/entities to towers and repeated MO across cases.",
  },
  {
    id: "generic",
    label: "General investigation",
    aliases: [],
    modules: ["cdr", "financial", "geo", "graph", "cyber", "conflicts", "brief", "report"],
    description: "Safe full suite when crime type is unclear",
    rationale: "Default broad coverage when crime family cannot be classified confidently.",
  },
];

export function resolvePlaybook(crimeType: string): CrimePlaybook {
  const lower = (crimeType || "").toLowerCase();
  for (const pb of CRIME_PLAYBOOKS) {
    if (pb.id === "generic") continue;
    if (pb.aliases.some((a) => lower.includes(a)) || lower.includes(pb.label.toLowerCase())) {
      return pb;
    }
  }
  return CRIME_PLAYBOOKS.find((p) => p.id === "generic")!;
}

export function playbookCatalogForUi() {
  return CRIME_PLAYBOOKS.filter((p) => p.id !== "generic").map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    rationale: p.rationale,
    modules: p.modules,
  }));
}
