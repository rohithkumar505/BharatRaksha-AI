"use client";

import { useCallback, useEffect, useState } from "react";
import { forceRerunLabel, useInvestigationMode } from "@/hooks/useInvestigationMode";
import { HeartHandshake, Loader2, RefreshCw } from "lucide-react";

function Sev({ s }: { s?: string }) {
  if (!s) return null;
  const color =
    s === "CRITICAL" || s === "HIGH" ? "var(--danger)" : s === "MEDIUM" ? "var(--warning)" : "var(--text-secondary)";
  return <span style={{ fontSize: "0.7rem", color, fontWeight: 600 }}>{s}</span>;
}

/** Women-safety intel — stalking, escalation, proximity, trafficking, threat keywords. */
export function WomenSafetyPanel({ caseId }: { caseId: string }) {
  const mode = useInvestigationMode(caseId);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [alertsCreated, setAlertsCreated] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch(`/api/cases/${caseId}/women-safety`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed");
        setData(j);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function run() {
    setRunning(true);
    setError("");
    try {
      const res = await fetch(`/api/cases/${caseId}/women-safety`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Run failed");
      setAlertsCreated(typeof j.alertsCreated === "number" ? j.alertsCreated : null);
      setData(j.analysis ?? j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  const stalking = Array.isArray(data?.stalking) ? (data!.stalking as Array<Record<string, unknown>>) : [];
  const escalation = Array.isArray(data?.escalation) ? (data!.escalation as Array<Record<string, unknown>>) : [];
  const proximity = Array.isArray(data?.proximity) ? (data!.proximity as Array<Record<string, unknown>>) : [];
  const trafficking = Array.isArray(data?.trafficking) ? (data!.trafficking as Array<Record<string, unknown>>) : [];
  const threats = Array.isArray(data?.threatKeywords) ? (data!.threatKeywords as Array<Record<string, unknown>>) : [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div>
          <h2 style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <HeartHandshake size={18} /> Women Safety Intelligence
          </h2>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Stalking / escalation / proximity / trafficking leads + narrative keywords — assistive only, not guilt
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
            Refresh
          </button>
          <button type="button" className="btn btn-primary" onClick={run} disabled={running}>
            {running ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            {forceRerunLabel(mode, "Re-analyze & Alert")}
          </button>
        </div>
      </div>

      {alertsCreated != null && (
        <p style={{ fontSize: "0.8rem", color: "var(--success)", marginBottom: "0.75rem" }}>
          Alerts created/updated: {alertsCreated}
        </p>
      )}
      {loading && <p style={{ color: "var(--text-secondary)" }}>Loading women-safety intel…</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {!loading && data && (
        <div style={{ display: "grid", gap: "1rem" }}>
          <Block title={`Stalking patterns (${stalking.length})`}>
            {stalking.length === 0 ? (
              <Empty text="No repeat/night CDR stalking patterns above thresholds." />
            ) : (
              stalking.slice(0, 12).map((s, i) => (
                <Item
                  key={i}
                  title={`${s.caller} → ${s.targetHint ?? "?"}`}
                  body={`${s.callCount} calls · ${s.nightCallCount} night · ${s.uniqueDays} days — ${s.reason}`}
                  sev={String(s.severity)}
                />
              ))
            )}
          </Block>

          <Block title={`Harassment escalation (${escalation.length})`}>
            {escalation.length === 0 ? (
              <Empty text="No rising call-frequency escalation detected." />
            ) : (
              escalation.slice(0, 10).map((e, i) => (
                <Item key={i} title={String(e.caller)} body={String(e.reason)} sev={String(e.severity)} />
              ))
            )}
          </Block>

          <Block title={`Proximity / corridor (${proximity.length})`}>
            {proximity.length === 0 ? (
              <Empty text="No geo proximity corridors yet — upload tower/geo evidence." />
            ) : (
              proximity.slice(0, 10).map((p, i) => (
                <Item key={i} title={String(p.entityRef)} body={String(p.reason)} sev={String(p.severity)} />
              ))
            )}
          </Block>

          <Block title={`Trafficking / missing indicators (${trafficking.length})`}>
            {trafficking.length === 0 ? (
              <Empty text="No multi-location shared-phone trafficking leads." />
            ) : (
              trafficking.map((t, i) => (
                <Item key={i} title={`${t.sharedPhoneCount} phones · multi-loc`} body={String(t.reason)} sev={String(t.severity)} />
              ))
            )}
          </Block>

          <Block title={`Narrative threat keywords (${threats.length})`}>
            {threats.length === 0 ? (
              <Empty text="No threat keywords in description/notes." />
            ) : (
              threats.slice(0, 15).map((t, i) => (
                <Item key={i} title={`${t.keyword} (${t.source})`} body={String(t.snippet)} />
              ))
            )}
          </Block>
        </div>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: "1rem" }}>
      <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.65rem" }}>{title}</h3>
      <div style={{ display: "grid", gap: "0.45rem" }}>{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{text}</p>;
}

function Item({ title, body, sev }: { title: string; body: string; sev?: string }) {
  return (
    <div style={{ padding: "0.55rem 0.65rem", background: "var(--bg-secondary)", borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
        <strong style={{ fontSize: "0.82rem" }}>{title}</strong>
        <Sev s={sev} />
      </div>
      <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.4 }}>{body}</p>
    </div>
  );
}
