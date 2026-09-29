"use client";

import { useEffect, useState } from "react";
import { NetworkGraph } from "./NetworkGraph";
import {
  Phone,
  Radio,
  Smartphone,
  AlertTriangle,
  Users,
  BarChart3,
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { forceRerunLabel, useInvestigationMode } from "@/hooks/useInvestigationMode";

interface CdrAnalysis {
  summary: {
    totalRecords: number;
    uniquePhones: number;
    uniqueTowers: number;
    uniqueDevices: number;
    dateRange: { from: string | null; to: string | null };
    totalCallDurationSec: number;
  };
  frequentContacts: Array<{
    caller: string;
    receiver: string;
    callCount: number;
    totalDurationSec: number;
    avgDurationSec: number;
  }>;
  bursts: Array<{
    phone: string;
    callCount: number;
    spikeRatio: number;
    severity: string;
    reason: string;
    windowStart: string;
    involvedParties: string[];
  }>;
  colocations: Array<{
    towerId: string;
    phones: string[];
    callCount: number;
    reason: string;
    windowStart: string;
  }>;
  deviceLinks: Array<{
    imei: string;
    phones: string[];
    sharedDevice: boolean;
    callCount: number;
  }>;
  phoneActivity: Array<{
    phone: string;
    totalCalls: number;
    uniqueContacts: number;
    totalDurationSec: number;
  }>;
  subgraph: {
    nodes: Array<{ id: string; label: string; value: string; type: string }>;
    edges: Array<{ id: string; source: string; target: string; type: string; weight: number }>;
  };
  hourlyDistribution: Array<{ hour: number; count: number }>;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#f59e0b",
  LOW: "#94a3b8",
};

interface Props {
  caseId: string;
}

export function CommunicationIntelPanel({ caseId }: Props) {
  const mode = useInvestigationMode(caseId);
  const [data, setData] = useState<CdrAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [showCallGraph, setShowCallGraph] = useState(false);

  function load() {
    setLoading(true);
    fetch(`/api/cases/${caseId}/communication`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [caseId]);

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/communication`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setData(result.analysis);
      }
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
        <Loader2 size={24} className="spin" style={{ color: "var(--accent)" }} />
        <p style={{ marginTop: "0.5rem", color: "var(--text-secondary)" }}>Analyzing CDR data...</p>
      </div>
    );
  }

  if (!data || data.summary.totalRecords === 0) {
    return (
      <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
        <Phone size={32} style={{ color: "var(--text-secondary)", marginBottom: "0.75rem" }} />
        <p style={{ color: "var(--text-secondary)" }}>
          No CDR data yet. Upload a Call Detail Records (CDR) CSV to begin communication intelligence analysis.
        </p>
      </div>
    );
  }

  const graphNodes = data.subgraph.nodes.map((n) => ({
    id: n.id,
    label: n.type,
    value: n.value,
    type: n.type,
  }));
  const graphEdges = data.subgraph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: `${e.type} (${e.weight})`,
  }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Phone size={18} /> Communication Intelligence (CDR)
        </h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowCallGraph(!showCallGraph)}
            style={{ fontSize: "0.8rem" }}
          >
            {showCallGraph ? "Hide" : "Show"} Call Graph
          </button>
          <button
            className="btn btn-primary"
            onClick={runAnalysis}
            disabled={analyzing}
            style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: 4 }}
          >
            {analyzing ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
            {forceRerunLabel(mode, "Re-analyze & Alert")}
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        {[
          { label: "CDR Records", value: data.summary.totalRecords },
          { label: "Unique Phones", value: data.summary.uniquePhones },
          { label: "Cell Towers", value: data.summary.uniqueTowers },
          { label: "Devices (IMEI)", value: data.summary.uniqueDevices },
          { label: "Total Duration", value: `${Math.round(data.summary.totalCallDurationSec / 60)} min` },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{s.label}</p>
            <p style={{ fontSize: "1.25rem", fontWeight: 700 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {showCallGraph && (
        <div style={{ marginBottom: "1.5rem" }}>
          <NetworkGraph nodes={graphNodes} edges={graphEdges} height={400} />
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
            CDR communication subgraph — {graphNodes.length} nodes, {graphEdges.length} call/device links
          </p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
        {/* Frequent contacts */}
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <Users size={14} /> Frequent Contacts
          </h3>
          {data.frequentContacts.slice(0, 8).map((fc, i) => (
            <div key={i} style={{ marginBottom: "0.5rem", fontSize: "0.8rem", padding: "0.4rem", background: "var(--bg-secondary)", borderRadius: 6 }}>
              <p style={{ fontWeight: 500 }}>{fc.caller} ↔ {fc.receiver}</p>
              <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                {fc.callCount} calls · {fc.totalDurationSec}s total · avg {fc.avgDurationSec}s
              </p>
            </div>
          ))}
        </div>

        {/* Burst detection */}
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={14} style={{ color: "var(--warning)" }} /> Communication Bursts
          </h3>
          {data.bursts.length === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No bursts detected vs baseline</p>
          ) : (
            data.bursts.slice(0, 6).map((b, i) => (
              <div key={i} style={{ marginBottom: "0.5rem", fontSize: "0.8rem", padding: "0.4rem", background: "rgba(245,158,11,0.08)", borderRadius: 6, borderLeft: `3px solid ${SEVERITY_COLORS[b.severity] ?? "#f59e0b"}` }}>
                <p style={{ fontWeight: 500 }}>
                  <span className="badge badge-new" style={{ fontSize: "0.6rem", marginRight: 4 }}>{b.severity}</span>
                  {b.phone} — {b.callCount} calls ({b.spikeRatio}x)
                </p>
                <p style={{ fontSize: "0.65rem", color: "var(--text-secondary)", marginTop: 2 }}>{b.reason}</p>
              </div>
            ))
          )}
        </div>

        {/* Co-location */}
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <Radio size={14} style={{ color: "#22c55e" }} /> Co-location (Tower Overlap)
          </h3>
          {data.colocations.length === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No co-location events detected</p>
          ) : (
            data.colocations.slice(0, 6).map((c, i) => (
              <div key={i} style={{ marginBottom: "0.5rem", fontSize: "0.8rem" }}>
                <p style={{ fontWeight: 500 }}>{c.towerId}</p>
                <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                  {c.phones.length} phones: {c.phones.slice(0, 3).join(", ")}{c.phones.length > 3 ? ` +${c.phones.length - 3}` : ""}
                </p>
                <p style={{ fontSize: "0.65rem", color: "var(--warning)" }}>{c.reason}</p>
              </div>
            ))
          )}
        </div>

        {/* IMEI / Device links */}
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <Smartphone size={14} style={{ color: "#8b5cf6" }} /> IMEI / Device Linking
          </h3>
          {data.deviceLinks.length === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No IMEI data in CDR records</p>
          ) : (
            data.deviceLinks.slice(0, 6).map((d, i) => (
              <div key={i} style={{ marginBottom: "0.5rem", fontSize: "0.8rem" }}>
                <p style={{ fontWeight: 500, fontFamily: "monospace", fontSize: "0.75rem" }}>
                  {d.sharedDevice && <AlertTriangle size={10} style={{ display: "inline", color: "var(--danger)" }} />}{" "}
                  {d.imei}
                </p>
                <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                  {d.phones.join(", ")} · {d.callCount} calls
                  {d.sharedDevice && " · SHARED DEVICE"}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Phone activity ranking */}
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <BarChart3 size={14} /> Phone Activity Ranking
          </h3>
          {data.phoneActivity.slice(0, 8).map((p, i) => (
            <p key={i} style={{ fontSize: "0.8rem", marginBottom: 4 }}>
              {i + 1}. {p.phone} — {p.totalCalls} calls, {p.uniqueContacts} contacts
            </p>
          ))}
        </div>

        {/* Hourly distribution chart */}
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem" }}>Call Activity by Hour (UTC)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.hourlyDistribution}>
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <Tooltip
                contentStyle={{ background: "#1a2235", border: "1px solid #2d3a52", fontSize: 12 }}
              />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {data.hourlyDistribution.map((entry, index) => (
                  <Cell key={index} fill={entry.count > 0 ? "#22c55e" : "#334155"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
