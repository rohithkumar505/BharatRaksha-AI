/** Shared nav for left sidebar — additive routes; old hrefs preserved. */
export type NavItem = {
  href: string;
  label: string;
  permission: string;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "sih26190-core",
    label: "SIH26190 · Core",
    items: [
      { href: "/dashboard", label: "Dashboard", permission: "cases:read" },
      { href: "/legal-command", label: "MHA Command Center", permission: "reports:read" },
      { href: "/sih26190", label: "SIH26190 Portal", permission: "cases:read" },
      { href: "/legal-docs", label: "Legal Document Center", permission: "reports:read" },
      { href: "/help/sih26190", label: "IO Guide", permission: "cases:read" },
      { href: "/cases", label: "Cases", permission: "cases:read" },
      { href: "/evidence", label: "Evidence Vault", permission: "cases:read" },
      { href: "/entities/matches", label: "Entity Matches", permission: "entities:review" },
    ],
  },
  {
    id: "smart-automation",
    label: "26190 · Smart Automation+",
    items: [
      { href: "/network", label: "Network", permission: "graph:read" },
      { href: "/intelligence", label: "MO & Intelligence", permission: "analytics:read" },
      { href: "/mo-twins", label: "MO Twins", permission: "analytics:read" },
      { href: "/conflicts", label: "Conflicts", permission: "analytics:read" },
      { href: "/twins", label: "Case Twins", permission: "analytics:read" },
      { href: "/silence", label: "Silence Detector", permission: "analytics:read" },
      { href: "/mirror", label: "Mirror Identity", permission: "analytics:read" },
    ],
  },
  {
    id: "safety-cyber",
    label: "26190 · Safety & cyber docs",
    items: [
      { href: "/cyber", label: "Cyber Center", permission: "analytics:read" },
      { href: "/women-safety", label: "Women Safety", permission: "analytics:read" },
      { href: "/alerts", label: "Alerts", permission: "alerts:read" },
    ],
  },
  {
    id: "ai-partner",
    label: "26190 · AI document assist",
    items: [
      { href: "/copilot", label: "Copilot", permission: "copilot:use" },
      { href: "/brief", label: "Case Brief", permission: "copilot:use" },
      { href: "/voice", label: "Voice Partner", permission: "copilot:use" },
      { href: "/clues", label: "Clues & Hypotheses", permission: "copilot:use" },
      { href: "/coach", label: "Investigator Coach", permission: "copilot:use" },
    ],
  },
  {
    id: "justice",
    label: "SIH26190 · Court & filings",
    items: [
      { href: "/court", label: "Reports & Court Pack", permission: "reports:read" },
      { href: "/cinema", label: "Story Cinema", permission: "cases:read" },
      { href: "/chargesheet", label: "Charge-sheet Assist", permission: "reports:read" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    items: [
      { href: "/admin/users", label: "Users", permission: "users:manage" },
      { href: "/admin/audit", label: "Audit", permission: "audit:read" },
      { href: "/settings", label: "Settings", permission: "cases:read" },
      { href: "/features", label: "Feature map (26190)", permission: "cases:read" },
    ],
  },
];

export const FEATURE_DIRECTORY: Array<{
  href: string;
  title: string;
  group: string;
  description: string;
  needsCase?: boolean;
}> = [
  { href: "/dashboard", title: "Command Center", group: "SIH26190 Core", description: "Live stats, legal metrics, next actions" },
  { href: "/cases", title: "Cases", group: "SIH26190 Core", description: "Investigation cases — all documents register under 26190" },
  { href: "/evidence", title: "Evidence Vault", group: "SIH26190 Core", description: "Cross-case vault → legal register" },
  { href: "/entities/matches", title: "Entity Matches", group: "SIH26190 Core", description: "Identity merges for exhibit linkage" },
  { href: "/network", title: "Network Graph", group: "26190 Smart Automation+", description: "POLE graph → registered investigation documents", needsCase: true },
  { href: "/intelligence", title: "MO & Intelligence", group: "26190 Smart Automation+", description: "Analytics feeding legal review", needsCase: true },
  { href: "/mo-twins", title: "MO Twin Matcher", group: "26190 Smart Automation+", description: "Similar MO — cross-case document context", needsCase: true },
  { href: "/conflicts", title: "Conflict Radar", group: "26190 Smart Automation+", description: "Contradictions before IO certification", needsCase: true },
  { href: "/twins", title: "Case Twin Compare", group: "26190 Smart Automation+", description: "Overlap for prosecution brief docs", needsCase: true },
  { href: "/silence", title: "Silence Detector", group: "26190 Smart Automation+", description: "Timeline gaps for investigation records", needsCase: true },
  { href: "/mirror", title: "Mirror Identity", group: "26190 Smart Automation+", description: "Fusion scoreboard for registered artifacts", needsCase: true },
  { href: "/cyber", title: "Cyber Center", group: "26190 Safety & cyber", description: "Cyber docs → FORENSIC_REPORT category", needsCase: true },
  { href: "/women-safety", title: "Women Safety", group: "26190 Safety & cyber", description: "Priority alerts → legal review queue", needsCase: true },
  { href: "/alerts", title: "Alerts", group: "26190 Safety & cyber", description: "Legal + investigation alerts" },
  { href: "/copilot", title: "AI Copilot", group: "26190 AI document assist", description: "Grounded Q&A on ingested register files", needsCase: true },
  { href: "/brief", title: "AI Case Brief", group: "26190 AI document assist", description: "EN/HI brief for prosecution documents", needsCase: true },
  { href: "/voice", title: "Voice Partner", group: "26190 AI document assist", description: "Voice interface for IO document workflow", needsCase: true },
  { href: "/clues", title: "Clues & Hypotheses", group: "26190 AI document assist", description: "Leads before court filing", needsCase: true },
  { href: "/coach", title: "Investigator Coach", group: "26190 AI document assist", description: "Next steps for legal workflow", needsCase: true },
  { href: "/legal-command", title: "MHA Command Center", group: "SIH26190 Core", description: "Smart Automation analytics + retention scan", needsCase: false },
  { href: "/sih26190", title: "SIH26190 Portal", group: "SIH26190 Core", description: "Official PS hub + full capability registry" },
  { href: "/help/sih26190", title: "Investigator Guide", group: "SIH26190 Core", description: "IO manual for legal document workflow" },
  { href: "/verify-document", title: "Public Verify", group: "SIH26190 Core", description: "Nazarat integrity check (no login)" },
  { href: "/legal-docs", title: "Legal Document Center", group: "SIH26190 Core", description: "Register, workflow, BSA §63, bundle verify", needsCase: true },
  { href: "/court", title: "Court Pack", group: "SIH26190 Court & filings", description: "Court-ready bundle + disclosure", needsCase: true },
  { href: "/cinema", title: "Story Cinema", group: "SIH26190 Court & filings", description: "Timeline story for court narrative", needsCase: true },
  { href: "/chargesheet", title: "Charge-sheet Assist", group: "SIH26190 Court & filings", description: "Draft → CHARGE_SHEET_DRAFT register", needsCase: true },
];
