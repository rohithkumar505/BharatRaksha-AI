"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/SiteHeader";
import { usePermissions } from "@/hooks/usePermissions";

interface AuditLog {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user?: { name: string; email: string; role: string };
}

export default function AuditLogPage() {
  const { can } = usePermissions();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!can("audit:read")) return;
    fetch("/api/audit?limit=200")
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.logs ?? []);
        setTotal(data.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [can]);

  if (!can("audit:read")) {
    return (
      <AppShell>
                <main style={{ padding: "2rem", textAlign: "center" }}>
          <p>Access denied. Auditor or Admin role required.</p>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
            <main style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Audit Trail
        </h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
          Immutable log of all system actions — {total} total entries
        </p>

        {loading ? (
          <p>Loading audit logs...</p>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: "0.8rem" }}>
                      {new Date(log.createdAt).toLocaleString("en-IN")}
                    </td>
                    <td>
                      {log.user?.name ?? "System"}
                      <br />
                      <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                        {log.user?.role}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-new">{log.action}</span>
                    </td>
                    <td>
                      {log.resource}
                      {log.resourceId && (
                        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                          <br />{log.resourceId.slice(0, 12)}...
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.75rem" }}>{log.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AppShell>
  );
}
