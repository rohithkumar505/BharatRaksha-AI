"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ClipboardList, ExternalLink } from "lucide-react";
import { parseApiError } from "@/lib/parse-api-error";

type Readiness = {
  score: number;
  readyForCourtFiling: boolean;
  steps: Array<{ id: string; label: string; done: boolean; hint: string }>;
  summary: {
    totalDocuments: number;
    ioPending: number;
    prosecutionPending: number;
  };
};

type TimelineRow = { at: string; kind: string; title: string; detail: string };

export function LegalInvestigatorGuide({ caseId }: { caseId: string }) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/cases/${caseId}/legal-documents/readiness`),
        fetch(`/api/cases/${caseId}/legal-documents/timeline`),
      ]);
      const j1 = await r1.json();
      const j2 = await r2.json();
      if (r1.ok) setReadiness(j1);
      else setError(parseApiError(j1, "Could not load readiness"));
      if (r2.ok) setTimeline(j2.timeline ?? []);
    } catch {
      setError("Network error loading investigator guide");
    }
  }, [caseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function seedSamples() {
    setBusy("seed");
    setError("");
    setMessage("");
    const res = await fetch(`/api/cases/${caseId}/legal-documents/seed-samples`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const j = await res.json();
    setBusy("");
    if (!res.ok) {
      setError(parseApiError(j, "Sample upload failed"));
      return;
    }
    setMessage(j.message ?? "Samples registered");
    await refresh();
    window.dispatchEvent(new CustomEvent("legal-docs-refresh"));
  }

  async function courtPrep() {
    setBusy("prep");
    setError("");
    const res = await fetch(`/api/cases/${caseId}/legal-documents/court-prep`, { method: "POST" });
    const j = await res.json();
    setBusy("");
    if (!res.ok) {
      setError(parseApiError(j, "Court prep failed"));
      return;
    }
    setMessage(
      `Court prep complete — readiness ${j.readiness?.score ?? 0}% · integrity ${j.integrity?.passed ?? 0}/${j.integrity?.total ?? 0}`
    );
    await refresh();
  }

  return (
    <div className="card" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <ClipboardList size={18} style={{ color: "var(--saffron)" }} />
            Investigator workspace (SIH26190)
          </h2>
          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", maxWidth: 720, marginTop: 4 }}>
            Live checklist from your case data — upload real files, certify, verify integrity, export court packs. No
            mock scores.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => void seedSamples()}>
            {busy === "seed" ? "Registering…" : "Register sample FIR pack"}
          </button>
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void courtPrep()}>
            {busy === "prep" ? "Running…" : "Run court prep"}
          </button>
          <Link href="/help/sih26190" className="btn btn-secondary">
            <ExternalLink size={14} /> IO manual
          </Link>
        </div>
      </div>

      {readiness && (
        <div style={{ marginTop: "1rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", marginBottom: "0.75rem" }}>
            <span style={{ fontSize: "2rem", fontWeight: 800, color: "var(--saffron)" }}>{readiness.score}%</span>
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Court filing readiness
              {readiness.readyForCourtFiling ? " — core requirements met" : " — complete steps below"}
            </span>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.35rem" }}>
            {readiness.steps.map((s) => (
              <li
                key={s.id}
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "flex-start",
                  fontSize: "0.78rem",
                  padding: "0.35rem 0",
                }}
              >
                {s.done ? (
                  <CheckCircle2 size={16} style={{ color: "var(--success)", flexShrink: 0 }} />
                ) : (
                  <Circle size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                )}
                <div>
                  <div style={{ fontWeight: 600 }}>{s.label}</div>
                  <div style={{ color: "var(--text-secondary)" }}>{s.hint}</div>
                </div>
              </li>
            ))}
          </ul>
          {readiness.summary.prosecutionPending > 0 && (
            <p style={{ fontSize: "0.75rem", color: "var(--warning)", marginTop: "0.75rem" }}>
              Tip: Prosecution certify needs Senior Officer —{" "}
              <code>senior@bharatraksha.gov.in</code> / <code>Senior@Bharat2026!</code>
            </p>
          )}
        </div>
      )}

      {message && <p style={{ color: "var(--success)", fontSize: "0.85rem", marginTop: "0.75rem" }}>{message}</p>}
      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: "0.75rem" }}>{error}</p>}

      {timeline.length > 0 && (
        <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
          <h3 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>Recent legal activity</h3>
          <ul style={{ fontSize: "0.72rem", color: "var(--text-secondary)", maxHeight: 140, overflow: "auto" }}>
            {timeline.slice(0, 8).map((t, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {new Date(t.at).toLocaleString("en-IN")} · {t.title} — {t.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
