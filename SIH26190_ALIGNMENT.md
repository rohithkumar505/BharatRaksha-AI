# SIH26190 alignment — Bharat Raksha AI

**Problem statement:** SIH26190 — Secure Digital Document Management for Legal & Investigation Documents (MHA, Smart Automation)

**Verdict:** This codebase is built **for SIH26190 only**. Network, copilot, CDR-style analytics, and court assist are **26190 Smart Automation extensions** — they enrich investigation **documents** that are registered, certified, and sealed in the same legal vault.

## PS requirement → implementation

| MHA / SIH26190 expectation | Where it lives |
|----------------------------|----------------|
| Central repository for legal & investigation files | MinIO vault + `Evidence` records per case |
| Unique document registration ID | `registerNumber` (`REG-{case}-{seq}`) at ingest |
| Legal categories (FIR, exhibits, court filings, etc.) | `LegalDocumentCategory` enum + upload UI |
| Classification (official / restricted / confidential) | `ClassificationLevel` + RBAC |
| Review & approval workflow | `LegalDocumentStatus` state machine + senior-officer gates |
| Legal hold & retention | `legalHold`, `retentionUntil` |
| Version control | `documentVersion`, `parentEvidenceId`, “New version” upload |
| Chain of custody | `CustodyLog` + hash-chained `LedgerBlock` |
| Tamper detection / integrity | `verifyCaseDocumentBundle`, blockchain verify |
| BSA 2023 §63 electronic records | BSA JSON certificate export per document |
| Search & discovery | `/api/legal-documents/search` + filters on register |
| Court / disclosure bundle | Court pack manifest + legal register JSON/HTML |
| Audit trail | `AuditLog` on status/metadata changes + detail VIEWED custody |
| Public integrity check (register + hash) | `/api/legal-documents/public-verify` |
| Role-based access | NextAuth + 4-tier RBAC + case access rules |
| **Smart Automation** — playbooks, retention scan, OCR, captions | `/legal-command`, `legal-automation-engine`, ingest enrich |
| **Verifiable chain-of-custody** — dual transfer confirm, export report | `custody-timeline`, ledger `CustodyLog` |
| **Duplicate hash watchdog** | `GET .../duplicates`, org daily autopilot |
| **Platform reliability score** | `GET /api/legal-documents/reliability` |

## Feature tiers (all SIH26190)

| Tier | Meaning | Examples |
|------|---------|----------|
| **core** | MHA document lifecycle (must demo) | Register, workflow, BSA §63, seal, disclosure, court pack |
| **smart_automation** | Theme: automation on same register | Playbooks, retention scan, custody timeline, OCR |
| **smart_automation_plus** | Optional depth (same PS) | Network, copilot, conflicts, cyber → registered artifacts |

Full machine-readable list: `GET /api/legal-documents/capabilities` (each feature has `psAlignment: SIH26190` and `tier`).

## Unique SIH26190 differentiators (live)

| Feature | Route / action |
|---------|----------------|
| Dual IO + Prosecution certification | Legal Docs → **IO certify** / **Prosecution certify** (seal requires both) |
| Auto disclosure annexure (Annexure A/B…) | **Disclosure annexure** download |
| Nazarat QR sticker | **QR** on row or detail → scan → `/verify-document` |
| Smart filename classifier | Upload `sample_fir.txt` → auto-tagged **FIR** |
| Custody forwarding | Detail → **Nazarat forward** (TRANSFERRED custody log) |
| Retention watchdog | Banner when docs expire within 60 days |
| Public integrity portal | `/verify-document?register=…&hash=…` (no login) |
| Verifiable custody timeline + HTML report | Legal Docs detail → **Export report** |
| Dual-confirmed custody transfer | Evidence/Legal → transfer + recipient **Confirm receipt** |
| One-Click MHA Court File playbook | Legal Docs → Smart Automation case panel |

## Demo path (judges)

1. Login → **Legal Docs (SIH26190)** in sidebar (or Dashboard legal metrics).
2. Select a case → upload FIR / witness statement / exhibit.
3. Walk workflow: Registered → Under review → Approved for court → Sealed.
4. **Verify bundle** → **BSA §63** download → **Register HTML** printout.
5. Open **Detail** → custody trail + workflow note + public verify URL.
6. **Reports & Court Pack** on same page for disclosure manifest.
7. (Optional) **26190 Smart Automation+** — network / copilot / charge-sheet assist → outputs registered as legal documents.

## Smart Automation+ (same PS, optional demo modules)

Neo4j network, CDR, financial radar, copilot, cyber & women safety — **not a second SIH ID**. They demonstrate end-to-end flow: investigation artifact → **SIH26190 register** → certify → court bundle.

## Credentials

See README — seeded passwords `*@Bharat2026!` (e.g. `Invest@Bharat2026!` for investigator).
