"use client";

import { AppShell } from "@/components/SiteHeader";
import { extractCasesList } from "@/lib/api-list";
import Link from "next/link";
import { useEffect, useState } from "react";

interface CaseRow {
  id: string;
  caseNumber: string;
  crimeType: string;
  _count?: { evidence?: number; entities?: number };
}

/** Cross-case evidence vault — real case counts, open workspace for custody. */
export default function EvidenceVaultPage() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/cases?limit=50")
      .then((r) => r.json())
      .then((d) => setCases(extractCasesList<CaseRow>(d)))
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Evidence Vault</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
          Browse evidence volume across cases. Open a case for upload, custody, and verify tools (unchanged).
        </p>
        {loading && <p style={{ color: "var(--text-secondary)" }}>Loading…</p>}
        {!loading && cases.length === 0 && (
          <div className="card" style={{ padding: "1.25rem" }}>
            <p style={{ marginBottom: "0.75rem" }}>No cases yet.</p>
            <Link href="/cases" className="btn btn-primary">Create case</Link>
          </div>
        )}
        {cases.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Crime</th>
                <th>Evidence</th>
                <th>Entities</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>{c.caseNumber}</td>
                  <td>{c.crimeType}</td>
                  <td>{c._count?.evidence ?? "—"}</td>
                  <td>{c._count?.entities ?? "—"}</td>
                  <td>
                    <Link href={`/cases/${c.id}`} style={{ color: "var(--accent)" }}>
                      Open Evidence tab
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </AppShell>
  );
}
