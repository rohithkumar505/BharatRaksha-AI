"use client";

import { useCallback, useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";

interface CoachCard {
  id: string;
  title: string;
  why: string;
  nextStep: string;
  avoid: string;
  confidence: number;
}

/** Junior investigator coaching cards from live clues/health. */
export function CoachPanel({ caseId }: { caseId: string }) {
  const [cards, setCards] = useState<CoachCard[]>([]);
  const [meta, setMeta] = useState({ healthScore: 0, playbookId: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch(`/api/cases/${caseId}/coach`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed");
        setCards(Array.isArray(j.cards) ? j.cards : []);
        setMeta({ healthScore: j.healthScore ?? 0, playbookId: j.playbookId ?? "" });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p style={{ color: "var(--text-secondary)" }}>Loading coach cards…</p>;
  if (error) return <p style={{ color: "var(--danger)" }}>{error}</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          <GraduationCap size={14} style={{ display: "inline", marginRight: 6 }} />
          Health {meta.healthScore}/100 · Playbook {meta.playbookId || "—"} · Assistive only
        </p>
        <button type="button" className="btn btn-secondary" onClick={load}>
          Refresh
        </button>
      </div>
      {cards.length === 0 ? (
        <div className="card" style={{ padding: "1.25rem", color: "var(--text-secondary)" }}>
          No coaching cards yet. Run Autopilot or add evidence first.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {cards.map((c) => (
            <div key={c.id} className="card" style={{ padding: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <strong>{c.title}</strong>
                <span className="badge badge-new">{Math.round(c.confidence * 100)}%</span>
              </div>
              <p style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>
                <span style={{ color: "var(--accent)", fontWeight: 600 }}>Why: </span>
                {c.why}
              </p>
              <p style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>
                <span style={{ color: "var(--success)", fontWeight: 600 }}>Next: </span>
                {c.nextStep}
              </p>
              <p style={{ fontSize: "0.8rem", color: "var(--warning)" }}>
                <span style={{ fontWeight: 600 }}>Avoid: </span>
                {c.avoid}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
