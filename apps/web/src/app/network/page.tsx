"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/SiteHeader";
import { GraphExplorer } from "@/components/GraphExplorer";
import Link from "next/link";
import { extractCasesList } from "@/lib/api-list";

interface Case {
  id: string;
  caseNumber: string;
  crimeType: string;
  _count: { entities: number };
}

export default function NetworkPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState("");

  useEffect(() => {
    fetch("/api/cases")
      .then((r) => r.json())
      .then((data) => {
        const list = extractCasesList<Case>(data);
        setCases(list);
        if (list.length > 0) setSelectedCase(list[0].id);
      })
      .catch(() => setCases([]));
  }, []);

  return (
    <AppShell>
            <main style={{ maxWidth: 1400, margin: "0 auto", padding: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>Criminal Network Graph</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
          Interactive POLE network — pan, zoom, search, N-hop expansion, evidence provenance
        </p>

        <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <select value={selectedCase} onChange={(e) => setSelectedCase(e.target.value)} style={{ maxWidth: 400 }}>
            <option value="">Select a case...</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber} — {c.crimeType} ({c._count.entities} entities)
              </option>
            ))}
          </select>
          {selectedCase && (
            <Link href={`/cases/${selectedCase}`} style={{ fontSize: "0.8rem", color: "var(--accent)" }}>
              Open case details →
            </Link>
          )}
        </div>

        {selectedCase ? (
          <GraphExplorer caseId={selectedCase} height={650} />
        ) : (
          <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
            <p style={{ color: "var(--text-secondary)" }}>
              {cases.length === 0
                ? "Create a case and upload evidence to build the network graph."
                : "Select a case to view entity links for registered investigation documents (SIH26190)."}
            </p>
          </div>
        )}
      </main>
    </AppShell>
  );
}
