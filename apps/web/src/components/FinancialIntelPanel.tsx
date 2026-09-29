"use client";

import { useEffect, useState } from "react";
import { NetworkGraph } from "./NetworkGraph";
import {
  IndianRupee,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ArrowRightLeft,
  RotateCcw,
  Zap,
  Filter,
  TrendingUp,
} from "lucide-react";
import { forceRerunLabel, useInvestigationMode } from "@/hooks/useInvestigationMode";

interface FinancialAnalysis {
  summary: {
    totalTransactions: number;
    totalVolume: number;
    uniqueAccounts: number;
    highValueCount: number;
    averageAmount: number;
    dateRange: { from: string | null; to: string | null };
  };
  fanOut: Array<{ account: string; uniqueCounterparties: number; totalAmount: number; reason: string; severity: string }>;
  fanIn: Array<{ account: string; uniqueCounterparties: number; totalAmount: number; reason: string; severity: string }>;
  circularFlows: Array<{ cycle: string[]; hops: number; totalAmount: number; reason: string; severity: string }>;
  rapidMovements: Array<{ path: string[]; hops: number; timeSpanMinutes: number; totalAmount: number; reason: string; severity: string }>;
  smurfing: Array<{ account: string; subThresholdCount: number; structuringCount: number; totalSmurfed: number; reason: string; severity: string }>;
  suspiciousScores: Array<{ account: string; score: number; factors: string[]; severity: string; totalIn: number; totalOut: number }>;
  highValueTransactions: Array<{ sender: string; receiver: string; amount: number; timestamp: string }>;
  filteredTransactions: Array<{ sender: string; receiver: string; amount: number; timestamp: string }>;
  subgraph: {
    nodes: Array<{ id: string; label: string; value: string; type: string }>;
    edges: Array<{ id: string; source: string; target: string; type: string; amount: number; weight: number }>;
  };
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

export function FinancialIntelPanel({ caseId }: Props) {
  const mode = useInvestigationMode(caseId);
  const [data, setData] = useState<FinancialAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [showFlowGraph, setShowFlowGraph] = useState(false);
  const [minAmount, setMinAmount] = useState("100000");
  const [amountFilter, setAmountFilter] = useState("");

  function load(filter?: string) {
    setLoading(true);
    const params = filter ? `?minAmount=${filter}` : "";
    fetch(`/api/cases/${caseId}/financial${params}`)
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
      const res = await fetch(`/api/cases/${caseId}/financial`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setData(result.analysis);
      }
    } finally {
      setAnalyzing(false);
    }
  }

  function applyAmountFilter() {
    const val = amountFilter || minAmount;
    load(val);
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
        <Loader2 size={24} className="spin" style={{ color: "var(--accent)" }} />
        <p style={{ marginTop: "0.5rem", color: "var(--text-secondary)" }}>Analyzing financial data...</p>
      </div>
    );
  }

  if (!data || data.summary.totalTransactions === 0) {
    return (
      <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
        <IndianRupee size={32} style={{ color: "var(--text-secondary)", marginBottom: "0.75rem" }} />
        <p style={{ color: "var(--text-secondary)" }}>
          No transaction data yet. Upload bank/UPI transaction CSV to begin financial intelligence analysis.
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
    type: `₹${e.amount.toLocaleString("en-IN")}`,
  }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <h2 style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <IndianRupee size={18} /> Financial Intelligence (AML)
        </h2>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={() => setShowFlowGraph(!showFlowGraph)} style={{ fontSize: "0.8rem" }}>
            {showFlowGraph ? "Hide" : "Show"} Money Flow Graph
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

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Transactions", value: data.summary.totalTransactions },
          { label: "Total Volume", value: `₹${data.summary.totalVolume.toLocaleString("en-IN")}` },
          { label: "Unique Accounts", value: data.summary.uniqueAccounts },
          { label: "High Value (≥₹1L)", value: data.summary.highValueCount },
          { label: "Avg Amount", value: `₹${Math.round(data.summary.averageAmount).toLocaleString("en-IN")}` },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{s.label}</p>
            <p style={{ fontSize: "1.1rem", fontWeight: 700 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* G7: Amount filter */}
      <div className="card" style={{ marginBottom: "1rem", padding: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <Filter size={14} style={{ color: "var(--text-secondary)" }} />
        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Transactions above ₹</span>
        <input
          value={amountFilter || minAmount}
          onChange={(e) => setAmountFilter(e.target.value)}
          style={{ width: 120, fontSize: "0.8rem" }}
          placeholder="100000"
        />
        <button className="btn btn-secondary" onClick={applyAmountFilter} style={{ fontSize: "0.75rem" }}>Filter</button>
        <button className="btn btn-secondary" onClick={() => { setAmountFilter(""); load(); }} style={{ fontSize: "0.75rem" }}>Clear</button>
        {data.filteredTransactions.length > 0 && amountFilter && (
          <span style={{ fontSize: "0.75rem", color: "var(--accent)" }}>
            {data.filteredTransactions.length} transactions ≥ ₹{Number(amountFilter || minAmount).toLocaleString("en-IN")}
          </span>
        )}
      </div>

      {showFlowGraph && (
        <div style={{ marginBottom: "1.5rem" }}>
          <NetworkGraph nodes={graphNodes} edges={graphEdges} height={400} />
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
            Transaction flow graph — edge labels show total transferred amount
          </p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
        {/* Suspicious scores */}
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <TrendingUp size={14} style={{ color: "var(--danger)" }} /> Suspicious Account Scores
          </h3>
          {data.suspiciousScores.length === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No elevated risk scores</p>
          ) : (
            data.suspiciousScores.slice(0, 6).map((s, i) => (
              <div key={i} style={{ marginBottom: "0.5rem", padding: "0.4rem", background: "var(--bg-secondary)", borderRadius: 6, borderLeft: `3px solid ${SEVERITY_COLORS[s.severity]}` }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>{s.account}</span>
                  <span style={{ fontWeight: 700, color: SEVERITY_COLORS[s.severity] }}>{s.score}</span>
                </div>
                {(Array.isArray(s.factors) ? s.factors : []).slice(0, 2).map((f, j) => (
                  <p key={j} style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>• {f}</p>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Circular flows */}
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <RotateCcw size={14} style={{ color: "#ef4444" }} /> Circular Money Flows
          </h3>
          {data.circularFlows.length === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No circular patterns detected</p>
          ) : (
            data.circularFlows.slice(0, 5).map((c, i) => (
              <div key={i} style={{ marginBottom: "0.5rem", fontSize: "0.8rem", padding: "0.4rem", background: "rgba(239,68,68,0.08)", borderRadius: 6 }}>
                <p style={{ fontWeight: 500 }}>{c.cycle.join(" → ")}</p>
                <p style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>{c.hops} hops · ₹{c.totalAmount.toLocaleString("en-IN")}</p>
              </div>
            ))
          )}
        </div>

        {/* Fan-out / Fan-in */}
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <ArrowRightLeft size={14} /> Fan-in / Fan-out
          </h3>
          {data.fanOut.slice(0, 3).map((f, i) => (
            <p key={`out-${i}`} style={{ fontSize: "0.8rem", marginBottom: 4 }}>
              <span className="badge badge-new" style={{ fontSize: "0.6rem" }}>OUT</span> {f.account}: {f.uniqueCounterparties} recipients
            </p>
          ))}
          {data.fanIn.slice(0, 3).map((f, i) => (
            <p key={`in-${i}`} style={{ fontSize: "0.8rem", marginBottom: 4 }}>
              <span className="badge badge-medium" style={{ fontSize: "0.6rem" }}>IN</span> {f.account}: {f.uniqueCounterparties} senders
            </p>
          ))}
          {data.fanOut.length === 0 && data.fanIn.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No fan patterns detected</p>
          )}
        </div>

        {/* Rapid movement */}
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <Zap size={14} style={{ color: "#f59e0b" }} /> Rapid Movement (Layering)
          </h3>
          {data.rapidMovements.length === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No rapid multi-hop chains</p>
          ) : (
            data.rapidMovements.slice(0, 5).map((r, i) => (
              <div key={i} style={{ marginBottom: "0.5rem", fontSize: "0.8rem" }}>
                <p style={{ fontWeight: 500 }}>{r.path.join(" → ")}</p>
                <p style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>
                  {r.hops} hops in {r.timeSpanMinutes} min · ₹{r.totalAmount.toLocaleString("en-IN")}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Smurfing */}
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={14} style={{ color: "var(--warning)" }} /> Smurfing / Structuring
          </h3>
          {data.smurfing.length === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No structuring patterns</p>
          ) : (
            data.smurfing.slice(0, 5).map((s, i) => (
              <div key={i} style={{ marginBottom: "0.5rem", fontSize: "0.8rem" }}>
                <p style={{ fontWeight: 500 }}>{s.account}</p>
                <p style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>{s.reason}</p>
              </div>
            ))
          )}
        </div>

        {/* High value */}
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem" }}>High-Value (≥ ₹1 Lakh)</h3>
          {data.highValueTransactions.length === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No high-value transactions</p>
          ) : (
            data.highValueTransactions.map((t, i) => (
              <p key={i} style={{ fontSize: "0.8rem", marginBottom: 4 }}>
                ₹{t.amount.toLocaleString("en-IN")}: {t.sender} → {t.receiver}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
