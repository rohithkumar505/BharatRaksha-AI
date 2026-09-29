"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/SiteHeader";
import { CopilotPanel } from "@/components/CopilotPanel";
import { extractCasesList } from "@/lib/api-list";

interface Case {
  id: string;
  caseNumber: string;
  crimeType: string;
}

export default function CopilotPage() {
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
            <main style={{ maxWidth: 960, margin: "0 auto", padding: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          AI Investigation Copilot
        </h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
          Evidence-grounded RAG — hybrid retrieval (BM25 + embeddings) over case knowledge, graph analytics, and intelligence modules. Every answer includes source citations.
        </p>

        <select
          value={selectedCase}
          onChange={(e) => setSelectedCase(e.target.value)}
          style={{ marginBottom: "1rem", maxWidth: 400 }}
        >
          {cases.length === 0 && <option value="">No cases available</option>}
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.caseNumber} — {c.crimeType}
            </option>
          ))}
        </select>

        {selectedCase ? (
          <CopilotPanel caseId={selectedCase} />
        ) : (
          <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
            Create a case first to use the investigation copilot.
          </div>
        )}
      </main>
    </AppShell>
  );
}
