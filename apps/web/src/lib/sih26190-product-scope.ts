/**
 * Single product identity for judges, README, and UI — SIH26190 only.
 * Extra modules below are optional Smart Automation extensions (same MHA PS).
 */
export const SIH26190_PRODUCT = {
  id: "SIH26190",
  ministry: "MHA",
  theme: "Smart Automation",
  title: "Secure Digital Document Management for Legal & Investigation Documents",
  shortName: "Bharat Raksha AI · SIH26190",
} as const;

export const SIH26190_PITCH_ONE_LINER =
  "One platform, one problem statement (SIH26190): register, secure, automate, and produce court-ready legal and investigation documents — with optional Smart Automation+ on the same case file.";

/** Routes that are Smart Automation+ (not core register UI) — show contextual strip. */
export const SIH26190_EXTENSION_PATHS = new Set([
  "/network",
  "/intelligence",
  "/mo-twins",
  "/conflicts",
  "/twins",
  "/silence",
  "/mirror",
  "/cyber",
  "/women-safety",
  "/copilot",
  "/brief",
  "/voice",
  "/clues",
  "/coach",
  "/cinema",
  "/chargesheet",
]);

export function isSih26190ExtensionPath(pathname: string): boolean {
  if (SIH26190_EXTENSION_PATHS.has(pathname)) return true;
  return false;
}

/** Core SIH26190 routes (demo these first). */
export const SIH26190_CORE_PATHS = [
  "/sih26190",
  "/legal-docs",
  "/legal-command",
  "/help/sih26190",
  "/verify-document",
  "/court",
] as const;

export const SIH26190_EXTENSION_MODULES = [
  { href: "/network", title: "Network graph", pillar: "Entity linkage", blurb: "POLE graph → exhibits & statements in the legal register." },
  { href: "/intelligence", title: "MO & intelligence", pillar: "Smart Automation", blurb: "Analytics before IO certification." },
  { href: "/mo-twins", title: "MO twin matcher", pillar: "Cross-case context", blurb: "Similar MO patterns for prosecution briefs." },
  { href: "/conflicts", title: "Conflict radar", pillar: "Pre-cert QA", blurb: "FIR vs CDR vs bank gaps before court filing." },
  { href: "/twins", title: "Case twin compare", pillar: "Document overlap", blurb: "Side-by-side registered artifact overlap." },
  { href: "/silence", title: "Silence detector", pillar: "Timeline records", blurb: "Gaps in investigation document timelines." },
  { href: "/mirror", title: "Mirror identity", pillar: "Exhibit linkage", blurb: "Phone/UPI/vehicle fusion for registered entities." },
  { href: "/copilot", title: "AI copilot", pillar: "Smart Automation", blurb: "Grounded Q&A on vault files → legal register." },
  { href: "/brief", title: "Case brief", pillar: "Prosecution docs", blurb: "EN/HI briefs for PROSECUTION_BRIEF category." },
  { href: "/voice", title: "Voice partner", pillar: "IO assist", blurb: "Hands-free document workflow commands." },
  { href: "/clues", title: "Clues & hypotheses", pillar: "Review queue", blurb: "Leads before approving documents for court." },
  { href: "/coach", title: "Investigator coach", pillar: "Legal workflow", blurb: "Next steps aligned to SIH26190 statuses." },
  { href: "/cyber", title: "Cyber center", pillar: "FORENSIC_REPORT", blurb: "Cyber artifacts ingested as legal categories." },
  { href: "/women-safety", title: "Women safety", pillar: "Priority alerts", blurb: "Escalations → legal document review." },
  { href: "/chargesheet", title: "Charge-sheet assist", pillar: "CHARGE_SHEET_DRAFT", blurb: "Draft → register → dual cert → seal." },
  { href: "/cinema", title: "Story cinema", pillar: "Court narrative", blurb: "Timeline story from registered evidence." },
  { href: "/court", title: "Court pack", pillar: "Court filings", blurb: "Bundle + disclosure with BSA integrity chain." },
  { href: "/entities/matches", title: "Entity matches", pillar: "Register quality", blurb: "Merge identities before exhibit labeling." },
  { href: "/alerts", title: "Alerts", pillar: "Legal + retention", blurb: "LEGAL_* alerts from automation engine." },
] as const;
