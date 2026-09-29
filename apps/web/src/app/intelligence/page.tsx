"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/SiteHeader";
import { GraphExplorer } from "@/components/GraphExplorer";
import Link from "next/link";
import { Brain, Link2, RefreshCw, AlertTriangle } from "lucide-react";
import { extractCasesList } from "@/lib/api-list";
import { MoTwinPanel, CaseBriefPanel } from "@/components/Phase6IntelPanels";

interface Case {
  id: string;
  caseNumber: string;
  crimeType: string;
  _count: { entities: number };
}

interface CrossCaseLink {
  entityId: string;
  value: string;
  type: string;
  label: string;
  cases: Array<{ caseId: string; caseNumber: string }>;
}

export default function IntelligencePage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState("");
  const [crossCaseLinks, setCrossCaseLinks] = useState<CrossCaseLink[]>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    fetch("/api/cases")
      .then((r) => r.json())
      .then((data) => {
        const list = extractCasesList<Case>(data);
        setCases(list);
        if (list.length > 0) setSelectedCase(list[0].id);
      })
      .catch(() => setCases([]));
    loadCrossCase();
  }, []);

  async function loadCrossCase() {
    const res = await fetch("/api/graph/cross-case");
    if (res.ok) {
      const data = await res.json();
      setCrossCaseLinks(data.links ?? []);
    }
  }

  async function scanCrossCase() {
    setScanning(true);
    try {
      const res = await fetch("/api/graph/cross-case", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setCrossCaseLinks(data.links ?? []);
      }
    } finally {
      setScanning(false);
    }
  }

  return (
    <AppShell>
            <main style={{ maxWidth: 1400, margin: "0 auto", padding: "1.5rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <Brain size={24} style={{ color: "var(--accent)" }} />
            SIH26190 · Smart Automation+ · Document intelligence
          </h1>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Cross-case entity links and graph analytics — enriches investigation documents before IO certification in the legal register
          </p>
        </div>

        {/* Cross-case intelligence */}
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, fontSize: "1rem" }}>
              <Link2 size={16} /> Cross-Case Entity Links
            </h2>
            <button
              className="btn btn-primary"
              onClick={scanCrossCase}
              disabled={scanning}
              style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: 4 }}
            >
              <RefreshCw size={12} className={scanning ? "spin" : ""} />
              Scan & Create Alerts
            </button>
          </div>

          {crossCaseLinks.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              No cross-case links detected. Entities appearing in multiple cases will be flagged here.
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Type</th>
                  <th>Cases</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {crossCaseLinks.map((link) => (
                  <tr key={link.entityId}>
                    <td>
                      <AlertTriangle size={12} style={{ display: "inline", color: "var(--warning)", marginRight: 4 }} />
                      {link.value}
                    </td>
                    <td>{link.label}</td>
                    <td>
                      {link.cases.map((c) => (
                        <Link
                          key={c.caseId}
                          href={`/cases/${c.caseId}`}
                          style={{ marginRight: 8, fontSize: "0.8rem", color: "var(--accent)" }}
                        >
                          {c.caseNumber}
                        </Link>
                      ))}
                    </td>
                    <td>
                      <Link href="/alerts" style={{ fontSize: "0.75rem", color: "var(--warning)" }}>
                        View Alerts →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Case selector + graph explorer */}
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginRight: "0.5rem" }}>
            Select case for network analysis:
          </label>
          <select
            value={selectedCase}
            onChange={(e) => setSelectedCase(e.target.value)}
            style={{ maxWidth: 400 }}
          >
            <option value="">Select a case...</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber} — {c.crimeType} ({c._count.entities} entities)
              </option>
            ))}
          </select>
        </div>

        {selectedCase ? (
          <>
            <MoTwinPanel caseId={selectedCase} />
            <CaseBriefPanel caseId={selectedCase} />
            <GraphExplorer caseId={selectedCase} height={620} />
          </>
        ) : (
          <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
            <p style={{ color: "var(--text-secondary)" }}>
              {cases.length === 0
                ? "Create a case and upload evidence to begin intelligence analysis."
                : "Select a case to view graph analytics."}
            </p>
          </div>
        )}
      </main>
    </AppShell>
  );
}
