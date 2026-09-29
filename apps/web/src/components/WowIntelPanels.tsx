"use client";

import { useCallback, useEffect, useState } from "react";
import { extractCasesList } from "@/lib/api-list";
import { Download, Pause, Play, Pin } from "lucide-react";

function useCaseJson(caseId: string, endpoint: string) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch(`/api/cases/${caseId}/${endpoint}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed");
        setData(j);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [caseId, endpoint]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, loading, error, load, setData };
}

function Shell({
  title,
  subtitle,
  onRefresh,
  loading,
  error,
  children,
  extra,
}: {
  title: string;
  subtitle: string;
  onRefresh: () => void;
  loading: boolean;
  error: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div>
          <h2 style={{ fontWeight: 600 }}>{title}</h2>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{subtitle}</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {extra}
          <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>
      {loading && <p style={{ color: "var(--text-secondary)" }}>Loading…</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {!loading && !error && children}
    </div>
  );
}

function CardList({
  items,
}: {
  items: Array<{ key: string; title: string; body: string; meta?: string }>;
}) {
  if (items.length === 0) {
    return <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>No items for current evidence.</p>;
  }
  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {items.map((it) => (
        <div key={it.key} className="card" style={{ padding: "0.85rem 1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <strong style={{ fontSize: "0.85rem" }}>{it.title}</strong>
            {it.meta && <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{it.meta}</span>}
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.45 }}>{it.body}</p>
        </div>
      ))}
    </div>
  );
}

/** Post-crime silence — who went quiet after the incident window. */
export function SilenceDetectorPanel({ caseId }: { caseId: string }) {
  const { data, loading, error, load } = useCaseJson(caseId, "silence");
  const actors = Array.isArray(data?.silentActors) ? (data!.silentActors as Array<Record<string, unknown>>) : [];
  return (
    <Shell
      title="Silence Detector"
      subtitle="Actors active before the crime window with little/no activity after — investigative lead only."
      onRefresh={load}
      loading={loading}
      error={error}
    >
      <p style={{ fontSize: "0.8rem", marginBottom: "0.75rem", color: "var(--text-secondary)" }}>
        Anchor: {String(data?.incidentAnchor ?? "—")} ({String(data?.anchorSource ?? "")})
      </p>
      <CardList
        items={actors.map((a, i) => ({
          key: String(i),
          title: `${a.identifier} · ${a.channel}`,
          body: String(a.reason),
          meta: `${a.severity} · before ${a.beforeCount} / after ${a.afterCount}`,
        }))}
      />
    </Shell>
  );
}

/** Mirror identity fusion scoreboard. */
export function MirrorIdentityPanel({ caseId }: { caseId: string }) {
  const { data, loading, error, load } = useCaseJson(caseId, "mirror");
  const rows = Array.isArray(data?.rows) ? (data!.rows as Array<Record<string, unknown>>) : [];
  const summary = (data?.summary ?? {}) as Record<string, number>;
  return (
    <Shell
      title="Mirror Identity Scoreboard"
      subtitle="PERSON masks across phone / UPI / vehicle / IP / device / bank / email via live relationships."
      onRefresh={load}
      loading={loading}
      error={error}
    >
      <p style={{ fontSize: "0.8rem", marginBottom: "0.75rem", color: "var(--text-secondary)" }}>
        Persons {summary.personCount ?? 0} · Fully mirrored {summary.fullyMirrored ?? 0} · Avg score{" "}
        {Math.round(summary.avgScore ?? 0)}
      </p>
      <CardList
        items={rows.map((r, i) => ({
          key: String(r.personId ?? i),
          title: `${r.personName} (score ${r.score})`,
          body: String(r.reason),
          meta: Array.isArray(r.linked) ? `${(r.linked as unknown[]).length} links` : undefined,
        }))}
      />
    </Shell>
  );
}

/** Case twin similar list + optional compare. */
export function CaseTwinsPanel({ caseId }: { caseId: string }) {
  const { data, loading, error, load } = useCaseJson(caseId, "twins");
  const [otherId, setOtherId] = useState("");
  const [cases, setCases] = useState<Array<{ id: string; caseNumber: string }>>([]);
  const [compare, setCompare] = useState<Record<string, unknown> | null>(null);
  const [cmpLoading, setCmpLoading] = useState(false);

  useEffect(() => {
    fetch("/api/cases?limit=50")
      .then((r) => r.json())
      .then((d) => setCases(extractCasesList(d)))
      .catch(() => setCases([]));
  }, []);

  // GET returns { similar: { seed, similar: [...], computedAt } }
  const similarPayload = (data?.similar ?? null) as Record<string, unknown> | null;
  const similar = Array.isArray(similarPayload?.similar)
    ? (similarPayload!.similar as Array<Record<string, unknown>>)
    : Array.isArray(data?.similar)
      ? (data!.similar as Array<Record<string, unknown>>)
      : [];
  const seed = (similarPayload?.seed ?? null) as Record<string, unknown> | null;

  async function runCompare() {
    if (!otherId) return;
    setCmpLoading(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/twins?otherId=${encodeURIComponent(otherId)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Compare failed");
      setCompare(j);
    } catch (e) {
      setCompare({ error: e instanceof Error ? e.message : "Failed" });
    } finally {
      setCmpLoading(false);
    }
  }

  const cmpShared = Array.isArray(compare?.sharedEntities)
    ? (compare!.sharedEntities as Array<Record<string, unknown>>)
    : [];

  return (
    <Shell
      title="Case Twin Compare"
      subtitle="Similar cases by shared entities / crime type, then side-by-side overlap."
      onRefresh={load}
      loading={loading}
      error={error}
      extra={
        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
          <select value={otherId} onChange={(e) => setOtherId(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="">Compare with…</option>
            {cases.filter((c) => c.id !== caseId).map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={runCompare} disabled={!otherId || cmpLoading}>
            {cmpLoading ? "…" : "Compare"}
          </button>
        </div>
      }
    >
      {seed && (
        <p style={{ fontSize: "0.8rem", marginBottom: "0.75rem", color: "var(--text-secondary)" }}>
          Seed: {String(seed.caseNumber)} · {String(seed.crimeType)}
        </p>
      )}
      <h3 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>Similar cases</h3>
      <CardList
        items={similar.map((s, i) => ({
          key: String(s.caseId ?? i),
          title: String(s.caseNumber ?? s.caseId),
          body: `${s.crimeType ?? ""} · shared ${s.sharedCount ?? (Array.isArray(s.sharedValues) ? (s.sharedValues as unknown[]).length : "—")} values`,
          meta: s.overlapScore != null ? `overlap ${s.overlapScore}` : s.score != null ? `score ${s.score}` : undefined,
        }))}
      />
      {compare && (
        <div className="card" style={{ padding: "1rem", marginTop: "1rem" }}>
          <h3 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>Side-by-side comparison</h3>
          {"error" in compare ? (
            <p style={{ color: "var(--danger)" }}>{String(compare.error)}</p>
          ) : (
            <>
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                {String(compare.summary ?? "")} · overlap {String(compare.overlapScore ?? "—")}
              </p>
              <CardList
                items={cmpShared.slice(0, 40).map((v, i) => ({
                  key: String(v.caseAEntityId ?? i),
                  title: `${v.entityType}: ${v.value}`,
                  body: "Shared across both cases",
                }))}
              />
              {cmpShared.length === 0 && !("error" in compare) && (
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No shared entities.</p>
              )}
            </>
          )}
        </div>
      )}
    </Shell>
  );
}

/** Story cinema with play-through beats. */
export function StoryCinemaPanel({ caseId }: { caseId: string }) {
  const { data, loading, error, load } = useCaseJson(caseId, "cinema");
  const beats = Array.isArray(data?.beats) ? (data!.beats as Array<Record<string, unknown>>) : [];
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setIdx(0);
    setPlaying(false);
  }, [caseId, data?.computedAt]);

  useEffect(() => {
    if (!playing || beats.length === 0) return;
    const t = setInterval(() => {
      setIdx((i) => {
        if (i >= beats.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 2800);
    return () => clearInterval(t);
  }, [playing, beats.length]);

  const beat = beats[idx];

  return (
    <Shell
      title="Evidence Story Cinema"
      subtitle="Ordered investigation story beats from live case meta, alerts, CDR, txns, geo."
      onRefresh={load}
      loading={loading}
      error={error}
      extra={
        <button type="button" className="btn btn-primary" onClick={() => setPlaying((p) => !p)} disabled={beats.length === 0}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
          {playing ? "Pause" : "Play"}
        </button>
      }
    >
      <p style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
        {String(data?.title ?? "")} · {beats.length} beats · ~{String(data?.durationHintSec ?? "—")}s
      </p>
      {beat && (
        <div className="card" style={{ padding: "1.25rem", marginBottom: "0.75rem", borderColor: "rgba(255,153,51,0.4)" }}>
          <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: 6 }}>
            Beat {idx + 1}/{beats.length} · {String(beat.kind)} · {beat.timestamp ? String(beat.timestamp) : "untimed"}
          </div>
          <h3 style={{ fontSize: "1.05rem", marginBottom: 8 }}>{String(beat.title)}</h3>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.55 }}>{String(beat.narrative)}</p>
        </div>
      )}
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        {beats.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setIdx(i);
              setPlaying(false);
            }}
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              border: "none",
              background: i === idx ? "var(--saffron)" : "var(--border)",
              cursor: "pointer",
            }}
          />
        ))}
      </div>
    </Shell>
  );
}

/** Charge-sheet outline assist. */
export function ChargesheetPanel({ caseId }: { caseId: string }) {
  const { data, loading, error, load } = useCaseJson(caseId, "chargesheet");
  const sections = Array.isArray(data?.sections) ? (data!.sections as Array<Record<string, unknown>>) : [];
  return (
    <Shell
      title="Charge-sheet Assist"
      subtitle="AI-assisted outline from crime type + entities — IO/PP must review. Not a filed charge-sheet."
      onRefresh={load}
      loading={loading}
      error={error}
    >
      <p style={{ fontSize: "0.8rem", color: "var(--warning)", marginBottom: "0.75rem" }}>{String(data?.disclaimer ?? "")}</p>
      <p style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
        {String(data?.caseNumber ?? "")} · {String(data?.crimeType ?? "")}
      </p>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {sections.map((s, i) => (
          <div key={String(s.id ?? i)} className="card" style={{ padding: "1rem" }}>
            <strong style={{ fontSize: "0.9rem" }}>{String(s.heading)}</strong>
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem", fontSize: "0.82rem" }}>
              {(Array.isArray(s.bullets) ? (s.bullets as string[]) : []).map((b, j) => (
                <li key={j}>{b}</li>
              ))}
            </ul>
            <p style={{ fontSize: "0.72rem", color: "var(--accent)", marginTop: 8 }}>
              {(Array.isArray(s.statuteHints) ? (s.statuteHints as string[]) : []).join(" · ")}
            </p>
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** Court pack manifest + JSON download. */
export function CourtPackPanel({ caseId }: { caseId: string }) {
  const { data, loading, error, load } = useCaseJson(caseId, "court-pack");

  function download() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name =
      ((data.downloadMeta as { suggestedFileName?: string } | undefined)?.suggestedFileName) ||
      `court-pack-${caseId}.json`;
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  const reports = Array.isArray(data?.reports) ? (data!.reports as unknown[]) : [];
  const evidence = Array.isArray(data?.evidence) ? (data!.evidence as unknown[]) : [];
  const alerts = Array.isArray(data?.alerts) ? (data!.alerts as unknown[]) : [];

  return (
    <Shell
      title="Court Pack"
      subtitle="Manifest of reports, evidence hashes, alerts, custody — download JSON for the case file."
      onRefresh={load}
      loading={loading}
      error={error}
      extra={
        <button type="button" className="btn btn-primary" onClick={download} disabled={!data}>
          <Download size={14} /> Download JSON
        </button>
      }
    >
      <p style={{ fontSize: "0.8rem", color: "var(--warning)", marginBottom: "0.75rem" }}>{String(data?.disclaimer ?? "")}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
        <Stat label="Reports" value={reports.length} />
        <Stat label="Evidence" value={evidence.length} />
        <Stat label="Alerts" value={alerts.length} />
      </div>
      <CardList
        items={(evidence as Array<Record<string, unknown>>).slice(0, 20).map((e, i) => ({
          key: String(e.id ?? i),
          title: String(e.fileName),
          body: `SHA-256 ${String(e.sha256Hash ?? "").slice(0, 16)}… · ${e.ingestionStatus}`,
          meta: String(e.type),
        }))}
      />
    </Shell>
  );
}

/** Conflict / witness consistency radar. */
export function ConflictsPanel({ caseId }: { caseId: string }) {
  const { data, loading, error, load } = useCaseJson(caseId, "conflicts");
  const [running, setRunning] = useState(false);
  const conflicts = Array.isArray(data?.conflicts) ? (data!.conflicts as Array<Record<string, unknown>>) : [];
  const summary = (data?.summary ?? {}) as { total?: number };

  async function scan() {
    setRunning(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/conflicts`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Scan failed");
      // POST returns { alertsCreated, conflicts }
      const payload = j.conflicts ?? j;
      // force reload shape
      await load();
      void payload;
    } finally {
      setRunning(false);
    }
  }

  return (
    <Shell
      title="Conflict Radar / Witness Consistency"
      subtitle="FIR/notes vs CDR vs bank vs geo contradictions — alibi / narrative consistency leads."
      onRefresh={load}
      loading={loading}
      error={error}
      extra={
        <button type="button" className="btn btn-primary" onClick={scan} disabled={running}>
          {running ? "Scanning…" : "Scan & Alert"}
        </button>
      }
    >
      <p style={{ fontSize: "0.8rem", marginBottom: "0.75rem", color: "var(--text-secondary)" }}>
        Conflicts: {summary.total ?? conflicts.length}
      </p>
      <CardList
        items={conflicts.map((c, i) => ({
          key: String(c.id ?? i),
          title: String(c.title),
          body: String(c.reason),
          meta: `${c.kind} · ${c.severity} · ${Math.round(Number(c.confidence || 0) * 100)}%`,
        }))}
      />
    </Shell>
  );
}

/** Local pinboard — pins entities/clues in browser for the case. */
export function InvestigationPinboard({ caseId }: { caseId: string }) {
  const key = `br-pins-${caseId}`;
  const [pins, setPins] = useState<Array<{ id: string; label: string; note: string }>>([]);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setPins(raw ? JSON.parse(raw) : []);
    } catch {
      setPins([]);
    }
  }, [key]);

  function save(next: typeof pins) {
    setPins(next);
    localStorage.setItem(key, JSON.stringify(next));
  }

  return (
    <div className="card" style={{ padding: "1rem", marginTop: "1rem" }}>
      <h3 style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, marginBottom: "0.75rem" }}>
        <Pin size={16} /> AI Pinboard (this device)
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pin label (entity/clue)" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            if (!label.trim()) return;
            save([...pins, { id: `${Date.now()}`, label: label.trim(), note: note.trim() }]);
            setLabel("");
            setNote("");
          }}
        >
          Pin
        </button>
      </div>
      <CardList
        items={pins.map((p) => ({
          key: p.id,
          title: p.label,
          body: p.note || "—",
        }))}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
