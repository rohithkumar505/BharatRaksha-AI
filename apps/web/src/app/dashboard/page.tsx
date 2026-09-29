"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/SiteHeader";
import Link from "next/link";
import { useAlertStream } from "@/hooks/useAlertStream";
import { AiDigestPanel } from "@/components/Phase6IntelPanels";
import { Sih26190QuickStart } from "@/components/Sih26190QuickStart";
import {
  FolderOpen,
  Users,
  AlertTriangle,
  IndianRupee,
  Bell,
  Network,
  Database,
  FileText,
} from "lucide-react";

interface DashboardData {
  stats: {
    activeCases: number;
    highPriority: number;
    personsOfInterest: number;
    suspiciousTransactions: number;
    newAlerts: number;
    totalEntities: number;
    totalRelationships: number;
    connectedNetworks: number;
    legalDocuments?: {
      totalDocuments: number;
      pendingReview: number;
      approvedForCourt: number;
      sealed: number;
      onLegalHold: number;
      bsaCertified: number;
      retentionDueSoon: number;
    };
  };
  recentAlerts: Array<{
    id: string;
    title: string;
    message: string;
    confidence: number | null;
    type: string;
    case?: { id: string; caseNumber: string };
  }>;
  recentCases: Array<{
    id: string;
    caseNumber: string;
    crimeType: string;
    priority: string;
    status: string;
    investigatingOfficer?: { name: string };
    _count: { entities: number; alerts: number };
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [liveAlert, setLiveAlert] = useState<string | null>(null);

  const loadDashboard = useCallback(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLastRefresh(new Date());
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  useAlertStream((alert) => {
    setLiveAlert(`${alert.title} — ${alert.caseNumber ?? "New alert"}`);
    loadDashboard();
  });

  const stats = data?.stats;

  const legal = stats?.legalDocuments;

  const statCards = [
    { label: "Active Cases", value: stats?.activeCases ?? 0, icon: FolderOpen, color: "#3b82f6" },
    { label: "High Priority", value: stats?.highPriority ?? 0, icon: AlertTriangle, color: "#ef4444" },
    { label: "Persons of Interest", value: stats?.personsOfInterest ?? 0, icon: Users, color: "#8b5cf6" },
    { label: "Suspicious Transactions", value: stats?.suspiciousTransactions ?? 0, icon: IndianRupee, color: "#f59e0b" },
    { label: "New Alerts", value: stats?.newAlerts ?? 0, icon: Bell, color: "#22c55e" },
    { label: "Total Entities", value: stats?.totalEntities ?? 0, icon: Database, color: "#a855f7" },
    { label: "Relationships", value: stats?.totalRelationships ?? 0, icon: Network, color: "#06b6d4" },
    { label: "Connected Networks", value: stats?.connectedNetworks ?? 0, icon: Network, color: "#14b8a6" },
  ];

  return (
    <AppShell>
            <main style={{ maxWidth: 1400, margin: "0 auto", padding: "1.5rem" }}>
        <div style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Command Center</h1>
            <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              SIH26190 command view — legal register metrics & Smart Automation+ modules
              {lastRefresh && ` • Last updated ${lastRefresh.toLocaleTimeString("en-IN")}`}
            </p>
            {liveAlert && (
              <p style={{ fontSize: "0.8rem", color: "var(--warning)", marginTop: "0.35rem" }}>
                Live: {liveAlert}
              </p>
            )}
          </div>
          <button className="btn btn-secondary" onClick={loadDashboard}>Refresh Now</button>
        </div>

        {loading && !data ? (
          <p style={{ color: "var(--text-secondary)" }}>Loading dashboard...</p>
        ) : (
          <>
            <Sih26190QuickStart />
            <AiDigestPanel />

            {legal && (
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Legal Document Management (SIH26190)</h2>
                  <Link href="/legal-docs" className="btn btn-secondary" style={{ fontSize: "0.8rem" }}>
                    Open Legal Document Center
                  </Link>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "0.75rem" }}>
                  {[
                    ["Registered docs", legal.totalDocuments],
                    ["Pending review", legal.pendingReview],
                    ["Court approved", legal.approvedForCourt],
                    ["Sealed", legal.sealed],
                    ["Legal hold", legal.onLegalHold],
                    ["BSA certified", legal.bsaCertified],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="stat-card" style={{ padding: "0.75rem" }}>
                      <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                        <FileText size={12} /> {label}
                      </p>
                      <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
              {statCards.map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="stat-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{label}</p>
                      <p style={{ fontSize: "2rem", fontWeight: 700, marginTop: "0.25rem" }}>{value}</p>
                    </div>
                    <Icon size={20} style={{ color }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
              <div className="card">
                <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Recent Alerts</h2>
                {(data?.recentAlerts ?? []).length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>No alerts yet. Upload evidence to begin analysis.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {(data?.recentAlerts ?? []).map((alert) => (
                      <Link
                        key={alert.id}
                        href={alert.case?.id ? `/cases/${alert.case.id}` : "/alerts"}
                        style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--border)", display: "block" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{alert.title}</span>
                          {alert.confidence != null && (
                            <span className="badge badge-new">{Math.round(alert.confidence * 100)}%</span>
                          )}
                        </div>
                        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                          {alert.message.slice(0, 120)}{alert.message.length > 120 ? "..." : ""}
                        </p>
                        {alert.case && (
                          <p style={{ fontSize: "0.75rem", color: "var(--accent)", marginTop: "0.25rem" }}>{alert.case.caseNumber}</p>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>Recent Cases</h2>
                  <Link href="/cases" className="btn btn-secondary" style={{ fontSize: "0.75rem" }}>View All</Link>
                </div>
                {(data?.recentCases ?? []).length === 0 ? (
                  <div>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1rem" }}>No cases yet.</p>
                    <Link href="/cases" className="btn btn-primary">Create Case</Link>
                  </div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr><th>Case</th><th>Type</th><th>Priority</th><th>Entities</th></tr>
                    </thead>
                    <tbody>
                      {(data?.recentCases ?? []).map((c) => (
                        <tr key={c.id}>
                          <td><Link href={`/cases/${c.id}`} style={{ color: "var(--accent)" }}>{c.caseNumber}</Link></td>
                          <td>{c.crimeType}</td>
                          <td><span className={`badge badge-${c.priority.toLowerCase()}`}>{c.priority}</span></td>
                          <td>{c._count.entities}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
