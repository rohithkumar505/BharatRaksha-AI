"use client";

import { AppShell } from "@/components/SiteHeader";
import Link from "next/link";

export default function Sih26190HelpPage() {
  return (
    <AppShell>
      <main style={{ maxWidth: 820, margin: "0 auto", padding: "1.5rem", lineHeight: 1.55 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Investigating Officer — SIH26190 guide</h1>
        <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem" }}>
          Bharat Raksha AI legal document module (MHA). Every action writes to Postgres, MinIO, and the hash-chained
          custody ledger.
        </p>

        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>1. Start</h2>
          <ol style={{ fontSize: "0.9rem", paddingLeft: "1.25rem" }}>
            <li>
              Login: <code>investigator@bharatraksha.gov.in</code> / <code>Invest@Bharat2026!</code>
            </li>
            <li>
              Open <Link href="/cases">Cases</Link> — create or open a case.
            </li>
            <li>
              Open <Link href="/legal-docs">Legal Docs (SIH26190)</Link> — select the case in the dropdown.
            </li>
          </ol>
        </section>

        <section style={{ marginTop: "1.25rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>2. Register documents</h2>
          <p style={{ fontSize: "0.9rem" }}>
            Upload FIR, statements, exhibits — or click <strong>Register sample FIR pack</strong> to ingest real files
            from <code>testdata/</code> with SHA-256 fingerprints. Filenames like <code>sample_fir.txt</code> auto-classify
            as FIR.
          </p>
        </section>

        <section style={{ marginTop: "1.25rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>3. Certify &amp; workflow</h2>
          <ul style={{ fontSize: "0.9rem", paddingLeft: "1.25rem" }}>
            <li>
              <strong>IO certify</strong> on each document (Investigator).
            </li>
            <li>
              <strong>Prosecution certify</strong> (Senior: <code>senior@bharatraksha.gov.in</code> /{" "}
              <code>Senior@Bharat2026!</code>).
            </li>
            <li>Advance status: Registered → Under review → Approved for court → Sealed (dual cert required to seal).</li>
          </ul>
        </section>

        <section style={{ marginTop: "1.25rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>4. Court output</h2>
          <ul style={{ fontSize: "0.9rem", paddingLeft: "1.25rem" }}>
            <li>
              <strong>Verify bundle</strong> — re-check all hashes.
            </li>
            <li>
              <strong>Disclosure annexure</strong> — Annexure A/B schedule JSON or HTML.
            </li>
            <li>
              <strong>BSA §63</strong> certificate per document.
            </li>
            <li>
              <strong>QR</strong> → public check at <Link href="/verify-document">/verify-document</Link>.
            </li>
            <li>
              <strong>Run court prep</strong> — one-click readiness + integrity refresh.
            </li>
          </ul>
        </section>

        <p style={{ marginTop: "2rem" }}>
          <Link href="/legal-docs" className="btn btn-primary">
            Back to Legal Document Center
          </Link>
        </p>
      </main>
    </AppShell>
  );
}
