"use client";

import { useEffect, useState } from "react";
import { Bot, Gauge, Play, Zap } from "lucide-react";

type Playbook = {
  id: string;
  scope: string;
  title: string;
  titleHi: string;
  description: string;
  uniqueDifferentiator?: string;
};

type Reliability = {
  reliabilityScore: number;
  status: string;
  checks: Record<string, { ok: boolean; detail?: string }>;
};

export function LegalAutomationHubPanel() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [reliability, setReliability] = useState<Reliability | null>(null);
  const [msg, setMsg] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch("/api/legal-documents/automation/playbooks")
      .then((r) => r.json())
      .then((j) => setPlaybooks(j.playbooks ?? []))
      .catch(() => setPlaybooks([]));
    fetch("/api/legal-documents/reliability")
      .then((r) => r.json())
      .then(setReliability)
      .catch(() => setReliability(null));
  }, []);

  async function runDaily() {
    setRunning(true);
    setMsg("");
    try {
      const res = await fetch("/api/legal-documents/automation/daily-run", { method: "POST" });
      const j = await res.json();
      setMsg(
        res.ok
          ? `Daily autopilot ${j.status}: retention + duplicate watchdog complete (run ${j.runId?.slice(0, 8)}…)`
          : j.error ?? "Run failed"
      );
    } finally {
      setRunning(false);
    }
  }

  const orgPlaybooks = playbooks.filter((p) => p.scope === "org");

  return (
    <div className="card" style={{ padding: "1.25rem", marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <Bot size={18} style={{ color: "var(--saffron)" }} />
            Smart Automation Engine
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4 }}>
            Audited playbooks · reliability score · org-wide compliance autopilot (SIH26190 differentiators)
          </p>
        </div>
        {reliability && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--bg-secondary)",
              padding: "0.5rem 0.85rem",
              borderRadius: 8,
            }}
          >
            <Gauge size={16} />
            <div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>Platform reliability</div>
              <div style={{ fontWeight: 700 }}>
                {reliability.reliabilityScore}% · {reliability.status}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
        <button type="button" className="btn btn-primary" disabled={running} onClick={() => void runDaily()}>
          <Play size={14} style={{ marginRight: 6 }} />
          Run org daily compliance
        </button>
      </div>

      {msg && (
        <p style={{ fontSize: "0.8rem", marginTop: "0.65rem", color: "var(--success)" }}>{msg}</p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: "0.75rem",
          marginTop: "1rem",
        }}
      >
        {orgPlaybooks.map((p) => (
          <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem" }}>
            <div style={{ fontWeight: 600, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 6 }}>
              <Zap size={14} /> {p.title}
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: 4 }}>{p.titleHi}</div>
            <p style={{ fontSize: "0.75rem", marginTop: 6 }}>{p.description}</p>
            {p.uniqueDifferentiator && (
              <p style={{ fontSize: "0.7rem", marginTop: 4, color: "var(--saffron)" }}>{p.uniqueDifferentiator}</p>
            )}
          </div>
        ))}
      </div>

      {reliability?.checks && (
        <div style={{ marginTop: "1rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
          {Object.entries(reliability.checks).map(([k, v]) => (
            <span key={k} style={{ marginRight: 12 }}>
              {k}: {v.ok ? "✓" : "✗"}
              {v.detail ? ` (${v.detail})` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
