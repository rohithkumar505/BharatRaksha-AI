"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/SiteHeader";
import Link from "next/link";
import { useAlertStream } from "@/hooks/useAlertStream";
import { extractArrayList } from "@/lib/api-list";

interface Alert {
  id: string;
  type: string;
  title: string;
  message: string;
  confidence: number | null;
  status: string;
  createdAt: string;
  case?: { id: string; caseNumber: string };
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAlerts = useCallback(() => {
    fetch("/api/alerts")
      .then((r) => r.json())
      .then((data) => setAlerts(extractArrayList<Alert>(data)))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  useAlertStream(() => {
    loadAlerts();
  });

  async function updateStatus(id: string, status: string) {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }

  return (
    <AppShell>
            <main style={{ maxWidth: 1400, margin: "0 auto", padding: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>Intelligence Alerts</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
          Real-time alerts via SSE push — cross-case links, bridge nodes, bursts, AML anomalies
        </p>

        {loading ? (
          <p style={{ color: "var(--text-secondary)" }}>Loading alerts...</p>
        ) : alerts.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
            <p style={{ color: "var(--text-secondary)" }}>
              No alerts yet. Alerts are generated automatically when evidence is processed.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {alerts.map((alert) => (
              <div key={alert.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.25rem" }}>
                    <span className={`badge ${alert.status === "NEW" ? "badge-high" : "badge-new"}`}>{alert.type.replace(/_/g, " ")}</span>
                    {alert.confidence && (
                      <span className="badge badge-medium">{Math.round(alert.confidence * 100)}% confidence</span>
                    )}
                  </div>
                  <h3 style={{ fontWeight: 600 }}>{alert.title}</h3>
                  <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>{alert.message}</p>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                    {new Date(alert.createdAt).toLocaleString("en-IN")}
                    {alert.case && (
                      <> • <Link href={`/cases/${alert.case.id}`} style={{ color: "var(--accent)" }}>{alert.case.caseNumber}</Link></>
                    )}
                  </p>
                </div>
                {alert.status === "NEW" && (
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    <button className="btn btn-primary" style={{ fontSize: "0.75rem" }} onClick={() => updateStatus(alert.id, "INVESTIGATING")}>Investigate</button>
                    <button className="btn btn-secondary" style={{ fontSize: "0.75rem" }} onClick={() => updateStatus(alert.id, "DISMISSED")}>Dismiss</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
