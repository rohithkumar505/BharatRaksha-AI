"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { extractCasesList } from "@/lib/api-list";
import { Brain, FileText, RefreshCw, Sparkles } from "lucide-react";

/** MO Twin matcher — fingerprint + similar-case linkage leads. */
export function MoTwinPanel({ caseId }: { caseId: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch(`/api/cases/${caseId}/mo-twins`)
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

  const fp = (data?.fingerprint ?? null) as Record<string, unknown> | null;
  const features = (fp?.features ?? {}) as Record<string, unknown>;
  const twinsPayload = (data?.twins ?? null) as Record<string, unknown> | null;
  const twins = Array.isArray(twinsPayload?.twins)
    ? (twinsPayload!.twins as Array<Record<string, unknown>>)
    : Array.isArray(data?.twins)
      ? (data!.twins as Array<Record<string, unknown>>)
      : [];

  return (
    <div className="card" style={{ padding: "1rem", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <div>
          <h2 style={{ fontWeight: 600, fontSize: "1rem", display: "flex", alignItems: "center", gap: 8 }}>
            <Brain size={16} /> MO Twin Matcher
          </h2>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Modus operandi fingerprint + cosine similarity to other cases (linkage lead, not proof).
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      {loading && <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Building fingerprint…</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {!loading && !error && fp && (
        <>
          <p style={{ fontSize: "0.8rem", marginBottom: "0.75rem" }}>
            <strong>{String(fp.caseNumber)}</strong> · {String(fp.crimeType)} · label{" "}
            <code style={{ fontSize: "0.75rem" }}>{String(fp.label)}</code>
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: "0.5rem", marginBottom: "1rem" }}>
            <MiniStat label="CDR" value={Number(features.cdrCount ?? 0)} />
            <MiniStat label="Txns" value={Number(features.txnCount ?? 0)} />
            <MiniStat label="Phones" value={Number(features.uniquePhones ?? 0)} />
            <MiniStat label="Locs" value={Number(features.locationDiversity ?? 0)} />
            <MiniStat label="Burst" value={Number(features.burstiness ?? 0)} />
            <MiniStat label="Night%" value={Math.round(Number(features.nightCallRatio ?? 0) * 100)} />
          </div>
          <h3 style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>Similar MO twins</h3>
          {twins.length === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No MO twins yet — need overlapping cases with enough signal.</p>
          ) : (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {twins.map((t) => (
                <div key={String(t.caseId)} style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                    <Link href={`/cases/${t.caseId}`} style={{ color: "var(--accent)", fontWeight: 600, fontSize: "0.85rem" }}>
                      {String(t.caseNumber)}
                    </Link>
                    <span style={{ fontSize: "0.75rem", color: "var(--saffron)" }}>
                      sim {Math.round(Number(t.similarity || 0) * 100)}%
                    </span>
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>{String(t.crimeType)}</p>
                  <p style={{ fontSize: "0.75rem", marginTop: 4 }}>
                    {(Array.isArray(t.sharedFeatureNotes) ? (t.sharedFeatureNotes as string[]) : []).slice(0, 6).join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Structured AI case brief with POIs + next actions. */
export function CaseBriefPanel({ caseId }: { caseId: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lang, setLang] = useState<"en" | "hi">("en");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch(`/api/cases/${caseId}/brief`)
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

  const pois = Array.isArray(data?.pois) ? (data!.pois as Array<Record<string, unknown>>) : [];
  const nextActions = Array.isArray(data?.nextActions) ? (data!.nextActions as string[]) : [];
  const highlights = Array.isArray(data?.alertHighlights) ? (data!.alertHighlights as string[]) : [];
  const summary =
    lang === "hi" && typeof data?.summaryHi === "string" && data.summaryHi
      ? String(data.summaryHi)
      : String(data?.summary ?? "");

  return (
    <div className="card" style={{ padding: "1rem", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <div>
          <h2 style={{ fontWeight: 600, fontSize: "1rem", display: "flex", alignItems: "center", gap: 8 }}>
            <FileText size={16} /> AI Case Brief
          </h2>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Structured brief from live evidence · source {String(data?.source ?? "—")}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          <button type="button" className={`btn ${lang === "en" ? "btn-primary" : "btn-secondary"}`} onClick={() => setLang("en")}>
            EN
          </button>
          <button type="button" className={`btn ${lang === "hi" ? "btn-primary" : "btn-secondary"}`} onClick={() => setLang("hi")}>
            HI
          </button>
          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>
      {loading && <p style={{ color: "var(--text-secondary)" }}>Generating brief…</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {!loading && !error && data && (
        <>
          <p style={{ fontSize: "0.85rem", lineHeight: 1.55, marginBottom: "0.75rem" }}>{summary}</p>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
            Health {String(data.healthScore)} · Conflicts {String(data.conflictsCount)} · Playbook {String(data.playbookId)}
          </p>
          {pois.length > 0 && (
            <>
              <h3 style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>Key POIs</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.75rem" }}>
                {pois.slice(0, 12).map((p) => (
                  <span
                    key={String(p.entityId)}
                    style={{ fontSize: "0.7rem", padding: "0.2rem 0.45rem", border: "1px solid var(--border)", borderRadius: 6 }}
                  >
                    {String(p.type)}: {String(p.value)}
                  </span>
                ))}
              </div>
            </>
          )}
          {nextActions.length > 0 && (
            <>
              <h3 style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>Next actions</h3>
              <ul style={{ fontSize: "0.8rem", margin: "0 0 0.75rem", paddingLeft: "1.1rem" }}>
                {nextActions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </>
          )}
          {highlights.length > 0 && (
            <>
              <h3 style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>Alert highlights</h3>
              <ul style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0, paddingLeft: "1.1rem" }}>
                {highlights.slice(0, 6).map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Dashboard since-last-visit AI digest. */
export function AiDigestPanel() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback((markSeen = false) => {
    setLoading(true);
    setError("");
    const key = "br-digest-last-visit";
    let since = localStorage.getItem(key);
    if (!since) {
      since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      localStorage.setItem(key, since);
    }
    fetch(`/api/dashboard/digest?since=${encodeURIComponent(since)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed");
        setData(j);
        if (markSeen) localStorage.setItem(key, new Date().toISOString());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const buckets = Array.isArray(data?.buckets) ? (data!.buckets as Array<Record<string, unknown>>) : [];
  const nextActions = Array.isArray(data?.nextActions) ? (data!.nextActions as string[]) : [];
  const topCases = Array.isArray(data?.topCases) ? (data!.topCases as Array<Record<string, unknown>>) : [];

  return (
    <div className="card" style={{ padding: "1rem", marginBottom: "1.5rem", borderColor: "rgba(255,153,51,0.35)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <div>
          <h2 style={{ fontWeight: 600, fontSize: "1rem", display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={16} style={{ color: "var(--saffron)" }} /> AI Digest
          </h2>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Since last visit · {String(data?.totalNewAlerts ?? 0)} new alert signals
            {data?.since ? ` · window from ${new Date(String(data.since)).toLocaleString("en-IN")}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          <button type="button" className="btn btn-secondary" onClick={() => load(false)} disabled={loading}>
            Refresh
          </button>
          <button type="button" className="btn btn-primary" onClick={() => load(true)} disabled={loading}>
            Mark seen
          </button>
        </div>
      </div>
      {loading && <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Building digest…</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {!loading && !error && (
        <>
          {nextActions.length > 0 && (
            <ul style={{ fontSize: "0.85rem", margin: "0 0 1rem", paddingLeft: "1.1rem" }}>
              {nextActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
          {topCases.length > 0 && (
            <p style={{ fontSize: "0.8rem", marginBottom: "0.75rem" }}>
              Hot cases:{" "}
              {topCases.map((c, i) => (
                <span key={String(c.caseId)}>
                  {i > 0 ? " · " : ""}
                  <Link href={`/cases/${c.caseId}`} style={{ color: "var(--accent)" }}>
                    {String(c.caseNumber)} ({String(c.alertCount)})
                  </Link>
                </span>
              ))}
            </p>
          )}
          {buckets.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Quiet since last visit — no new classified intel. Upload evidence or run Autopilot on active cases.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {buckets.map((b) => {
                const items = Array.isArray(b.items) ? (b.items as Array<Record<string, unknown>>) : [];
                return (
                  <div key={String(b.id)}>
                    <h3 style={{ fontSize: "0.85rem", marginBottom: "0.35rem" }}>
                      {String(b.label)} ({String(b.count)})
                    </h3>
                    <div style={{ display: "grid", gap: "0.35rem" }}>
                      {items.slice(0, 4).map((it) => (
                        <Link
                          key={String(it.id)}
                          href={`/cases/${it.caseId}`}
                          style={{
                            display: "block",
                            padding: "0.55rem 0.7rem",
                            background: "var(--bg-secondary)",
                            borderRadius: 8,
                            border: "1px solid var(--border)",
                            fontSize: "0.8rem",
                          }}
                        >
                          <strong>{String(it.title)}</strong>
                          <span style={{ color: "var(--text-secondary)" }}> · {String(it.caseNumber)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Case picker wrapper for brief / mo hubs. */
export function Phase6CaseTool({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: (caseId: string) => React.ReactNode;
}) {
  const [cases, setCases] = useState<Array<{ id: string; caseNumber: string; crimeType: string }>>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    fetch("/api/cases?limit=50")
      .then((r) => r.json())
      .then((d) => {
        const list = extractCasesList<{ id: string; caseNumber: string; crimeType: string }>(d);
        setCases(list);
        if (list[0]) setSelected(list[0].id);
      })
      .catch(() => setCases([]));
  }, []);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>{title}</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>{subtitle}</p>
      {cases.length > 0 && (
        <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ maxWidth: 420, marginBottom: "1rem" }}>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.caseNumber} — {c.crimeType}
            </option>
          ))}
        </select>
      )}
      {selected && children(selected)}
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: "center", padding: "0.5rem", background: "var(--bg-secondary)", borderRadius: 8 }}>
      <div style={{ fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>{label}</div>
    </div>
  );
}
