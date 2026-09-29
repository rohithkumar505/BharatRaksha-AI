"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

const CASE_PLAYBOOKS = [
  {
    id: "mha_one_click_court_file",
    label: "One-Click MHA Court File",
    hint: "Full chain: review queue, FIR pack links, exhibits, verify, court prep",
  },
  {
    id: "integrity_remediation_sweep",
    label: "Integrity remediation",
    hint: "Re-verify hashes + auto alerts on failures",
  },
  {
    id: "smart_fir_pack_linker",
    label: "Smart FIR pack linker",
    hint: "Link FIR, statements, exhibits for disclosure",
  },
] as const;

export function LegalCaseAutomationPanel({ caseId }: { caseId: string }) {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<string>("");
  const [dupes, setDupes] = useState<number | null>(null);

  async function runPlaybook(playbookId: string) {
    setRunning(playbookId);
    setResult("");
    try {
      const res = await fetch(`/api/cases/${caseId}/legal-documents/automation/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playbookId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Automation failed");
      const stepSummary = (j.steps ?? [])
        .map((s: { id: string; ok: boolean }) => `${s.id}:${s.ok ? "ok" : "warn"}`)
        .join(" · ");
      setResult(`${j.status} — ${stepSummary}${j.summary?.readinessScore != null ? ` · readiness ${j.summary.readinessScore}%` : ""}`);
      window.dispatchEvent(new Event("legal-docs-refresh"));
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Failed");
    } finally {
      setRunning(null);
    }
  }

  async function scanDuplicates() {
    const res = await fetch(`/api/cases/${caseId}/legal-documents/duplicates`);
    const j = await res.json();
    setDupes(j.duplicateGroups ?? 0);
  }

  return (
    <div
      style={{
        marginBottom: "1rem",
        padding: "0.85rem 1rem",
        borderRadius: 8,
        border: "1px dashed var(--border)",
        background: "var(--bg-secondary)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 6 }}>
        <Sparkles size={16} style={{ color: "var(--saffron)" }} />
        SIH26190 Smart Automation (case)
      </div>
      <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
        Unique audited playbooks — not mock UI; every step writes to DB + automation run history.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.65rem" }}>
        {CASE_PLAYBOOKS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn btn-secondary"
            title={p.hint}
            disabled={!!running}
            onClick={() => void runPlaybook(p.id)}
          >
            {running === p.id ? "Running…" : p.label}
          </button>
        ))}
        <button type="button" className="btn btn-secondary" onClick={() => void scanDuplicates()}>
          Duplicate hash scan
        </button>
        <a
          className="btn btn-secondary"
          href={`/api/cases/${caseId}/legal-documents/court-bundle-manifest`}
          target="_blank"
          rel="noreferrer"
        >
          Court bundle manifest
        </a>
      </div>
      {result && <p style={{ fontSize: "0.78rem", marginTop: 8, color: "var(--success)" }}>{result}</p>}
      {dupes !== null && (
        <p style={{ fontSize: "0.78rem", marginTop: 4 }}>
          Duplicate SHA-256 groups: <strong>{dupes}</strong>
          {dupes > 0 ? " — review before court production" : " — clean"}
        </p>
      )}
    </div>
  );
}
