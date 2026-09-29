"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { setInvestigationMode, type InvestigationMode } from "@/hooks/useInvestigationMode";

type Health = {
  score?: number;
  gaps?: string[];
  playbookId?: string;
  playbookLabel?: string;
  playbookDescription?: string;
  playbookModules?: string[];
  modules?: Record<string, boolean>;
};

/** Additive Overview strip — Dual Mode + Health + Autopilot progress. */
export function AutopilotOverviewPanel({ caseId }: { caseId: string }) {
  const [mode, setMode] = useState<InvestigationMode>("autopilot");
  const [health, setHealth] = useState<Health | null>(null);
  const [brief, setBrief] = useState<{ summary?: string; nextActions?: string[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<Array<{ stage: string; ok: boolean; detail: string }> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(`br-mode-${caseId}`);
    if (saved === "manual" || saved === "autopilot") setMode(saved);
    const savedStages = localStorage.getItem(`br-autopilot-stages-${caseId}`);
    if (savedStages) {
      try {
        setStages(JSON.parse(savedStages));
      } catch {
        /* ignore */
      }
    }
  }, [caseId]);

  const load = useCallback(() => {
    fetch(`/api/cases/${caseId}/health`)
      .then((r) => r.json())
      .then((d) => setHealth(d && !d.error ? d : null))
      .catch(() => setHealth(null));
    fetch(`/api/cases/${caseId}/brief`)
      .then((r) => r.json())
      .then((d) => setBrief(d && !d.error ? d : null))
      .catch(() => setBrief(null));
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  function setModeSafe(m: InvestigationMode) {
    setMode(m);
    setInvestigationMode(caseId, m);
  }

  async function runAutopilot() {
    setRunning(true);
    setError("");
    try {
      const res = await fetch(`/api/cases/${caseId}/autopilot`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Autopilot failed");
      const nextStages = Array.isArray(j.stages) ? j.stages : [];
      setStages(nextStages);
      localStorage.setItem(`br-autopilot-stages-${caseId}`, JSON.stringify(nextStages));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Autopilot failed");
    } finally {
      setRunning(false);
    }
  }

  const score = typeof health?.score === "number" ? health.score : null;
  const playbookModules = health?.playbookModules ?? [];

  return (
    <div className="card" style={{ marginBottom: "1rem", borderColor: "rgba(255,153,51,0.35)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <div>
          <h2 style={{ fontWeight: 600, fontSize: "1rem" }}>AI Autopilot</h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Playbook-driven analysis. Manual Expert keeps Sync / Re-analyze available in tabs.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            className={`btn ${mode === "autopilot" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setModeSafe("autopilot")}
          >
            Autopilot
          </button>
          <button
            type="button"
            className={`btn ${mode === "manual" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setModeSafe("manual")}
          >
            Manual Expert
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "1rem", marginBottom: "0.75rem" }}>
        <div style={{ textAlign: "center", padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: 8 }}>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--saffron)" }}>
            {score == null ? "—" : score}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Health</div>
        </div>
        <div>
          <p style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>
            Playbook: <strong>{health?.playbookLabel ?? health?.playbookId ?? "—"}</strong>
          </p>
          {health?.playbookDescription && (
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
              {health.playbookDescription}
            </p>
          )}
          {brief?.summary && (
            <p style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>{brief.summary}</p>
          )}
          <div style={{ marginTop: "0.35rem" }}>
            <Link href="/brief" style={{ fontSize: "0.75rem", color: "var(--accent)" }}>
              Full case brief →
            </Link>
            {" · "}
            <Link href="/mo-twins" style={{ fontSize: "0.75rem", color: "var(--accent)" }}>
              MO twins →
            </Link>
          </div>
          {Array.isArray(health?.gaps) && health!.gaps!.length > 0 && (
            <p style={{ fontSize: "0.75rem", color: "var(--warning)", marginTop: "0.35rem" }}>
              Gaps: {health!.gaps!.slice(0, 4).join(" · ")}
            </p>
          )}
        </div>
      </div>

      {playbookModules.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.75rem" }}>
          {playbookModules.map((mod) => {
            const ready = health?.modules?.[mod] === true;
            return (
              <span
                key={mod}
                style={{
                  fontSize: "0.7rem",
                  padding: "0.2rem 0.45rem",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: ready ? "rgba(34,197,94,0.15)" : "var(--bg-secondary)",
                  color: ready ? "var(--success)" : "var(--text-secondary)",
                }}
              >
                {ready ? "✓" : "○"} {mod}
              </span>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <button type="button" className="btn btn-primary" onClick={runAutopilot} disabled={running}>
          {running ? "Running Autopilot…" : "Run Autopilot now"}
        </button>
        <Link href="/cyber" className="btn btn-secondary">Cyber</Link>
        <Link href="/women-safety" className="btn btn-secondary">Women Safety</Link>
        <Link href="/clues" className="btn btn-secondary">Clues</Link>
        <Link href="/conflicts" className="btn btn-secondary">Conflicts</Link>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{error}</p>}
      {stages && (
        <ul style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
          {stages.map((s, i) => (
            <li key={`${s.stage}-${i}`} style={{ color: s.ok ? "var(--success)" : "var(--danger)" }}>
              {s.stage}: {s.detail}
            </li>
          ))}
        </ul>
      )}
      {Array.isArray(brief?.nextActions) && brief!.nextActions!.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600 }}>Next actions</div>
          <ul style={{ fontSize: "0.8rem", margin: "0.25rem 0 0", paddingLeft: "1.1rem" }}>
            {brief!.nextActions!.slice(0, 5).map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
