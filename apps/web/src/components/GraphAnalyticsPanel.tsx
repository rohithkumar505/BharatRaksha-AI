"use client";

import { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  GitBranch,
  Users,
  Brain,
  AlertTriangle,
  LineChart,
  Zap,
} from "lucide-react";

function safeText(v: unknown, max = 80): string {
  if (v == null) return "—";
  const s = String(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

interface Analytics {
  degree?: Array<{ id: string; value: string | null; label: string; score: number; rank: number }>;
  pageRank?: Array<{ id: string; value: string | null; label: string; score: number; rank: number }>;
  betweenness?: Array<{ id: string; value: string | null; label: string; score: number; rank: number }>;
  communities?: Array<{
    communityId: number;
    size: number;
    label: string;
    members?: Array<{ id: string; value: string | null; label: string | null }>;
  }>;
  bridges?: Array<{ id: string; value: string | null; label: string; betweenness: number; reason: string }>;
  intelligence?: Array<{ id: string; value: string | null; label: string; score: number; factors?: string[] }>;
}

interface Props {
  caseId: string;
  analytics: Analytics;
  evolution?: Array<{ date: string; cumulativeNodes: number; nodesAdded: number }>;
  onSelectNode?: (nodeId: string) => void;
}

export function GraphAnalyticsPanel({ caseId, analytics, evolution = [], onSelectNode }: Props) {
  const [whatIfNode, setWhatIfNode] = useState("");
  const [whatIfResult, setWhatIfResult] = useState<{
    networkSplits: boolean;
    explanation: string;
    nodeValue: string;
  } | null>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);

  async function runWhatIf() {
    if (!whatIfNode.trim()) return;
    setWhatIfLoading(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/graph/what-if`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: whatIfNode }),
      });
      if (res.ok) {
        const data = await res.json();
        setWhatIfResult(data);
      }
    } finally {
      setWhatIfLoading(false);
    }
  }

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h3 style={{ fontWeight: 600, marginBottom: "1rem", display: "flex", alignItems: "center", gap: 8 }}>
        <BarChart3 size={18} /> Graph Analytics & Intelligence
      </h3>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        {/* Intelligence Scores */}
        <div className="card">
          <h4 style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <Brain size={14} style={{ color: "var(--accent)" }} /> Key Entity Ranking
          </h4>
          {analytics.intelligence?.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Upload data to compute scores</p>
          )}
          {analytics.intelligence?.slice(0, 8).map((e, i) => (
            <div
              key={e.id}
              style={{
                marginBottom: "0.6rem",
                padding: "0.5rem",
                background: "var(--bg-secondary)",
                borderRadius: 6,
                cursor: onSelectNode ? "pointer" : "default",
              }}
              onClick={() => onSelectNode?.(e.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                  {i + 1}. {safeText(e.label, 24)}: {safeText(e.value, 32)}
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: e.score > 60 ? "var(--danger)" : e.score > 35 ? "var(--warning)" : "var(--text-secondary)",
                  }}
                >
                  {e.score}
                </span>
              </div>
              {(e.factors ?? []).slice(0, 2).map((f, j) => (
                <p key={j} style={{ fontSize: "0.65rem", color: "var(--text-secondary)", marginTop: 2 }}>
                  • {safeText(f, 80)}
                </p>
              ))}
            </div>
          ))}
        </div>

        {/* PageRank */}
        <div className="card">
          <h4 style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <TrendingUp size={14} style={{ color: "#22c55e" }} /> PageRank (Influence)
          </h4>
          {analytics.pageRank?.slice(0, 8).map((e, i) => (
            <p
              key={e.id}
              style={{ fontSize: "0.8rem", marginBottom: 4, cursor: onSelectNode ? "pointer" : "default" }}
              onClick={() => onSelectNode?.(e.id)}
            >
              {i + 1}. {safeText(e.label, 24)}: {safeText(e.value, 32)}{" "}
              <span style={{ color: "var(--text-secondary)" }}>({Number(e.score || 0).toFixed(4)})</span>
            </p>
          ))}
        </div>

        {/* Betweenness / Bridges */}
        <div className="card">
          <h4 style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <GitBranch size={14} style={{ color: "#f59e0b" }} /> Bridge Nodes
          </h4>
          {analytics.bridges?.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No bridge nodes detected yet</p>
          )}
          {analytics.bridges?.slice(0, 6).map((b) => (
            <div key={b.id} style={{ marginBottom: "0.5rem", fontSize: "0.8rem" }}>
              <p
                style={{ fontWeight: 500, cursor: onSelectNode ? "pointer" : "default" }}
                onClick={() => onSelectNode?.(b.id)}
              >
                <AlertTriangle size={10} style={{ display: "inline", color: "var(--warning)" }} />{" "}
                {safeText(b.label, 24)}: {safeText(b.value, 32)}
              </p>
              <p style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>{safeText(b.reason, 120)}</p>
            </div>
          ))}
        </div>

        {/* Communities */}
        <div className="card">
          <h4 style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <Users size={14} style={{ color: "#8b5cf6" }} /> Communities (Louvain)
          </h4>
          {analytics.communities?.slice(0, 5).map((c) => (
            <div key={c.communityId} style={{ marginBottom: "0.6rem" }}>
              <p style={{ fontSize: "0.8rem", fontWeight: 500 }}>{safeText(c.label, 60)}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {(c.members ?? []).slice(0, 4).map((m, mi) => (
                  <span
                    key={m.id || mi}
                    className="badge badge-new"
                    style={{ fontSize: "0.65rem", cursor: onSelectNode ? "pointer" : "default" }}
                    onClick={() => m.id && onSelectNode?.(m.id)}
                  >
                    {safeText(m.value ?? m.label ?? m.id, 20)}
                  </span>
                ))}
                {c.size > 4 && (
                  <span style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>+{c.size - 4} more</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Degree Centrality */}
        <div className="card">
          <h4 style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <BarChart3 size={14} /> Degree Centrality
          </h4>
          {analytics.degree?.slice(0, 8).map((e, i) => (
            <p
              key={e.id}
              style={{ fontSize: "0.8rem", marginBottom: 4, cursor: onSelectNode ? "pointer" : "default" }}
              onClick={() => onSelectNode?.(e.id)}
            >
              {i + 1}. {safeText(e.label, 24)}: {safeText(e.value, 32)} ({e.score} connections)
            </p>
          ))}
        </div>

        {/* Network Evolution */}
        {evolution.length > 0 && (
          <div className="card">
            <h4 style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
              <LineChart size={14} style={{ color: "#06b6d4" }} /> Network Growth
            </h4>
            {evolution.map((e) => (
              <div key={e.date} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: 4 }}>
                <span>{e.date}</span>
                <span>+{e.nodesAdded} → {e.cumulativeNodes} total</span>
              </div>
            ))}
          </div>
        )}

        {/* What-if Analysis */}
        <div className="card">
          <h4 style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <Zap size={14} style={{ color: "#ef4444" }} /> What-If Time Machine
          </h4>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
            Simulate removing a person/phone node — before/after connectivity (investigative lead).
          </p>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <input
              value={whatIfNode}
              onChange={(e) => setWhatIfNode(e.target.value)}
              placeholder="Entity ID to remove"
              style={{ flex: 1, fontSize: "0.75rem" }}
            />
            <button
              className="btn btn-secondary"
              onClick={runWhatIf}
              disabled={whatIfLoading}
              style={{ fontSize: "0.75rem" }}
            >
              Analyze
            </button>
          </div>
          {whatIfResult && (
            <div
              style={{
                padding: "0.5rem",
                borderRadius: 6,
                background: whatIfResult.networkSplits ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
                fontSize: "0.75rem",
              }}
            >
              <p style={{ fontWeight: 600, color: whatIfResult.networkSplits ? "var(--danger)" : "var(--success)" }}>
                {whatIfResult.networkSplits ? "⚠ Network may fragment" : "✓ Network remains connected"}
              </p>
              <p style={{ marginTop: 4, color: "var(--text-secondary)" }}>{whatIfResult.explanation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
