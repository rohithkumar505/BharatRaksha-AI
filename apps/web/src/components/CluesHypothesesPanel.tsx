"use client";

import { useCallback, useEffect, useState } from "react";
import { Lightbulb, AlertTriangle, HelpCircle } from "lucide-react";

interface ClueItem {
  id: string;
  title: string;
  reason: string;
  confidence: number;
  source: string;
  evidenceIds: string[];
}

interface HypothesisItem {
  id: string;
  title: string;
  theory: string;
  confidence: number;
  supportingClueIds: string[];
  caveats: string[];
}

/** Evidence-grounded clues + alternate theories — no invented facts. */
export function CluesHypothesesPanel({ caseId }: { caseId: string }) {
  const [clues, setClues] = useState<ClueItem[]>([]);
  const [hypotheses, setHypotheses] = useState<HypothesisItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [computedAt, setComputedAt] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch(`/api/cases/${caseId}/clues`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed");
        setClues(Array.isArray(j.clues) ? j.clues : []);
        setHypotheses(Array.isArray(j.hypotheses) ? j.hypotheses : []);
        setComputedAt(j.computedAt ?? "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p style={{ color: "var(--text-secondary)" }}>Loading clues…</p>;
  if (error) return <p style={{ color: "var(--danger)" }}>{error}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          Grounded in alerts, entities, and health gaps only
          {computedAt ? ` · ${new Date(computedAt).toLocaleString("en-IN")}` : ""}
        </p>
        <button type="button" className="btn btn-secondary" onClick={load}>
          Refresh
        </button>
      </div>

      <section>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 8 }}>
          <HelpCircle size={16} /> Hypotheses ({hypotheses.length})
        </h2>
        {hypotheses.length === 0 ? (
          <div className="card" style={{ padding: "1rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            No grounded hypotheses yet. Run Autopilot or upload more evidence.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {hypotheses.map((h) => (
              <div key={h.id} className="card" style={{ padding: "1rem", borderColor: "rgba(245,158,11,0.35)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.35rem" }}>
                  <strong style={{ fontSize: "0.9rem" }}>{h.title}</strong>
                  <span className="badge badge-new">{Math.round(h.confidence * 100)}%</span>
                </div>
                <p style={{ fontSize: "0.85rem", lineHeight: 1.5, marginBottom: "0.5rem" }}>{h.theory}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--warning)" }}>
                  <AlertTriangle size={12} style={{ display: "inline", marginRight: 4 }} />
                  {h.caveats.join(" · ")}
                </p>
                <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.35rem" }}>
                  Supports: {h.supportingClueIds.length} clue(s)
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 8 }}>
          <Lightbulb size={16} /> Clues ({clues.length})
        </h2>
        {clues.length === 0 ? (
          <div className="card" style={{ padding: "1rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            No clues yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {clues.map((c) => (
              <div key={c.id} className="card" style={{ padding: "0.85rem 1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <strong style={{ fontSize: "0.85rem" }}>{c.title}</strong>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                    {c.source} · {Math.round(c.confidence * 100)}%
                  </span>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.35rem", lineHeight: 1.45 }}>
                  {c.reason}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
