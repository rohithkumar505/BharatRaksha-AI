/** SIH26190 — shared legal document enums for API, ingest, and UI */
export const LEGAL_DOCUMENT_CATEGORIES = [
  "FIR",
  "INVESTIGATION_RECORD",
  "WITNESS_STATEMENT",
  "EXHIBIT",
  "CHARGE_SHEET_DRAFT",
  "PROSECUTION_BRIEF",
  "COURT_FILING",
  "JUDICIAL_ORDER",
  "FORENSIC_REPORT",
  "OFFICIAL_CORRESPONDENCE",
  "INTERNAL_MEMO",
] as const;

export type LegalDocumentCategoryValue = (typeof LEGAL_DOCUMENT_CATEGORIES)[number];

export const LEGAL_DOCUMENT_STATUSES = [
  "REGISTERED",
  "UNDER_REVIEW",
  "APPROVED_FOR_COURT",
  "SEALED",
  "ARCHIVED",
] as const;

export const CLASSIFICATION_LEVELS = ["OFFICIAL", "RESTRICTED", "CONFIDENTIAL"] as const;

export const SIH26190_CAPABILITY_MATRIX = [
  {
    id: "register",
    label: "Central document register",
    description: "Unique register numbers per case, exhibit labels, metadata capture at ingest.",
  },
  {
    id: "workflow",
    label: "Approval workflow",
    description: "REGISTERED → review → court approval → seal → archive with senior-officer gates.",
  },
  {
    id: "classification",
    label: "Classification & RBAC",
    description: "OFFICIAL / RESTRICTED / CONFIDENTIAL with role-aware access.",
  },
  {
    id: "custody",
    label: "Chain of custody",
    description: "Hash-chained ledger + custody event trail on every document.",
  },
  {
    id: "integrity",
    label: "Integrity verification",
    description: "SHA-256 re-check against MinIO + ledger chain; bundle verify for court pack.",
  },
  {
    id: "bsa63",
    label: "BSA 2023 §63 certificates",
    description: "Exportable electronic-record integrity certificates per document.",
  },
  {
    id: "hold",
    label: "Legal hold & retention",
    description: "Legal hold blocks destructive actions; retention dates for lifecycle policy.",
  },
  {
    id: "versioning",
    label: "Document versioning",
    description: "Superseding uploads linked to parent record with version counter.",
  },
  {
    id: "search",
    label: "Cross-case search",
    description: "Search register #, captions, exhibits, filenames, hash prefixes.",
  },
  {
    id: "court",
    label: "Court disclosure bundle",
    description: "Register JSON/HTML + court pack manifest with legal document index.",
  },
  {
    id: "dual-signoff",
    label: "Dual certification (IO + Prosecution)",
    description: "Investigator IO seal + Senior prosecution seal before court sealing — rare in student demos.",
  },
  {
    id: "disclosure",
    label: "Auto disclosure annexure",
    description: "Annexure A/B/C schedule for all court-approved documents with hash index.",
  },
  {
    id: "qr-nazarat",
    label: "QR Nazarat verify sticker",
    description: "Scannable QR linking to public integrity verify (register + hash prefix).",
  },
  {
    id: "smart-classify",
    label: "Smart legal classifier",
    description: "Filename/heuristic auto-tags FIR, 161 statements, FSL reports, exhibits at upload.",
  },
  {
    id: "forwarding",
    label: "Nazarat custody forwarding",
    description: "Formal TRANSFERRED custody event to another officer with audit trail.",
  },
  {
    id: "retention-watch",
    label: "Retention watchdog",
    description: "Dashboard of documents nearing retention expiry across accessible cases.",
  },
] as const;
