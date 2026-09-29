"use client";

import { useCallback, useEffect, useState } from "react";
import { forceRerunLabel, useInvestigationMode } from "@/hooks/useInvestigationMode";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";

type Severity = string;

function Sev({ s }: { s?: Severity }) {
  if (!s) return null;
  const color =
    s === "CRITICAL" || s === "HIGH" ? "var(--danger)" : s === "MEDIUM" ? "var(--warning)" : "var(--text-secondary)";
  return <span style={{ fontSize: "0.7rem", color, fontWeight: 600 }}>{s}</span>;
}

/** Live cyber intel panel — mule / SIM-swap / phishing / email / IP-device / crypto. */
export function CyberIntelPanel({ caseId }: { caseId: string }) {
  const mode = useInvestigationMode(caseId);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [alertsCreated, setAlertsCreated] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch(`/api/cases/${caseId}/cyber`)
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
      const res = await fetch(`/api/cases/${caseId}/cyber`, { method: "POST" });
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

  const muleSignals = Array.isArray(data?.muleSignals) ? (data!.muleSignals as Array<Record<string, unknown>>) : [];
  const simSwap = Array.isArray(data?.simSwapSuspects) ? (data!.simSwapSuspects as Array<Record<string, unknown>>) : [];
  const phishing = Array.isArray(data?.phishingUrls) ? (data!.phishingUrls as Array<Record<string, unknown>>) : [];
  const emails = Array.isArray(data?.emailIntel) ? (data!.emailIntel as Array<Record<string, unknown>>) : [];
  const clusters = Array.isArray(data?.ipDeviceClusters) ? (data!.ipDeviceClusters as Array<Record<string, unknown>>) : [];
  const crypto = Array.isArray(data?.cryptoHops) ? (data!.cryptoHops as Array<Record<string, unknown>>) : [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div>
          <h2 style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldAlert size={18} /> Cyber Intelligence
          </h2>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Mule / SIM-swap timing / phishing / email / device clusters / crypto — assistive leads from uploads
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
      {loading && <p style={{ color: "var(--text-secondary)" }}>Loading cyber intel…</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {!loading && data && (
        <div style={{ display: "grid", gap: "1rem" }}>
          <Section title={`Mule signals (${muleSignals.length})`}>
            {muleSignals.length === 0 ? (
              <Empty text="No mule fan-in/out signals from current transactions." />
            ) : (
              muleSignals.slice(0, 12).map((m, i) => (
                <Row
                  key={i}
                  title={String(m.account)}
                  body={(Array.isArray(m.factors) ? m.factors : []).join(" · ")}
                  right={<Sev s={String(m.severity)} />}
                  score={typeof m.score === "number" ? m.score : undefined}
                />
              ))
            )}
          </Section>

          <Section title={`SIM-swap / OTP timing suspects (${simSwap.length})`}>
            {simSwap.length === 0 ? (
              <Empty text="No IMEI-change / txn-window suspects from CDR+bank data." />
            ) : (
              simSwap.slice(0, 12).map((s, i) => (
                <Row
                  key={i}
                  title={String(s.phone)}
                  body={String(s.reason)}
                  right={
                    <span style={{ fontSize: "0.7rem" }}>
                      {s.nearTxnWindow ? "near txn" : ""} {Math.round(Number(s.confidence || 0) * 100)}%
                    </span>
                  }
                />
              ))
            )}
          </Section>

          <Section title={`Phishing URLs (${phishing.length})`}>
            {phishing.length === 0 ? (
              <Empty text="No URL/domain hits in entities/notes." />
            ) : (
              phishing.slice(0, 12).map((p, i) => (
                <Row
                  key={i}
                  title={String(p.value)}
                  body={`${p.source}: ${(Array.isArray(p.riskHints) ? p.riskHints : []).join(", ") || "review"}`}
                />
              ))
            )}
          </Section>

          <Section title={`Email intel (${emails.length})`}>
            {emails.length === 0 ? (
              <Empty text="No email entities." />
            ) : (
              emails.slice(0, 10).map((e, i) => (
                <Row
                  key={i}
                  title={String(e.email)}
                  body={`Domain ${e.domain} · ${(Array.isArray(e.riskHints) ? e.riskHints : []).join(", ") || "linked review"}`}
                />
              ))
            )}
          </Section>

          <Section title={`IP / device clusters (${clusters.length})`}>
            {clusters.length === 0 ? (
              <Empty text="No IP/device clusters yet." />
            ) : (
              clusters.slice(0, 12).map((c, i) => (
                <Row key={i} title={`${c.type}: ${c.key}`} body={String(c.reason)} />
              ))
            )}
          </Section>

          <Section title={`Crypto hops (${crypto.length})`}>
            {crypto.length === 0 ? (
              <Empty text="No crypto wallet links in graph." />
            ) : (
              crypto.slice(0, 10).map((c, i) => (
                <Row
                  key={i}
                  title={String(c.wallet)}
                  body={`${c.hopCount} hop(s) · ${(Array.isArray(c.linkedAccounts) ? c.linkedAccounts : []).join(", ")}`}
                />
              ))
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

function Row({
  title,
  body,
  right,
  score,
}: {
  title: string;
  body: string;
  right?: React.ReactNode;
  score?: number;
}) {
  return (
    <div style={{ padding: "0.55rem 0.65rem", background: "var(--bg-secondary)", borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
        <strong style={{ fontSize: "0.82rem" }}>{title}</strong>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {score != null && <span style={{ fontSize: "0.7rem", color: "var(--saffron)" }}>{score}</span>}
          {right}
        </div>
      </div>
      <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.4 }}>{body}</p>
    </div>
  );
}
