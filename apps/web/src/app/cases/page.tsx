"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/SiteHeader";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { extractCasesList } from "@/lib/api-list";
import { playbookCatalogForUi } from "@/lib/crime-playbooks";

interface Case {
  id: string;
  caseNumber: string;
  crimeType: string;
  location: string | null;
  priority: string;
  status: string;
  createdAt: string;
  investigatingOfficer?: { name: string };
  _count: { evidence: number; entities: number; alerts: number };
}

export default function CasesPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ status: "", priority: "", search: "" });
  const [form, setForm] = useState({
    crimeType: "",
    location: "",
    incidentDate: "",
    priority: "MEDIUM",
    description: "",
  });

  const loadCases = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.search) params.set("search", filters.search);
    fetch(`/api/cases?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const list = extractCasesList<Case>(data);
        setCases(list);
        setTotal(typeof data?.total === "number" ? data.total : list.length);
      })
      .catch(() => {
        setCases([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ crimeType: "", location: "", incidentDate: "", priority: "MEDIUM", description: "" });
      loadCases();
    }
  }

  return (
    <AppShell>
            <main style={{ maxWidth: 1400, margin: "0 auto", padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
          <div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Case Management</h1>
            <p style={{ color: "var(--text-secondary)" }}>
              {total} investigation case{total !== 1 ? "s" : ""} — CCTNS-style workflow
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={16} /> New Case
          </button>
        </div>

        <div className="card" style={{ marginBottom: "1.5rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "end" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Search</label>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
              <input
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Case number, crime type, location..."
              />
              <button className="btn btn-secondary" onClick={loadCases}><Search size={14} /></button>
            </div>
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Status</label>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={{ marginTop: "0.25rem" }}>
              <option value="">All</option>
              <option value="OPEN">Open</option>
              <option value="UNDER_INVESTIGATION">Under Investigation</option>
              <option value="PENDING_REVIEW">Pending Review</option>
              <option value="CLOSED">Closed</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Priority</label>
            <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} style={{ marginTop: "0.25rem" }}>
              <option value="">All</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontWeight: 600, marginBottom: "1rem" }}>Create New Case</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Crime Type * (AI playbook)</label>
                <select
                  value={playbookCatalogForUi().some((p) => p.label === form.crimeType) ? form.crimeType : form.crimeType ? "__custom__" : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__custom__") setForm({ ...form, crimeType: form.crimeType && !playbookCatalogForUi().some((p) => p.label === form.crimeType) ? form.crimeType : "" });
                    else setForm({ ...form, crimeType: v });
                  }}
                  required={!form.crimeType}
                  style={{ marginTop: "0.25rem", marginBottom: "0.5rem" }}
                >
                  <option value="">Select crime family…</option>
                  {playbookCatalogForUi().map((p) => (
                    <option key={p.id} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                  <option value="__custom__">Other / custom…</option>
                </select>
                <input
                  value={form.crimeType}
                  onChange={(e) => setForm({ ...form, crimeType: e.target.value })}
                  placeholder="Or type custom crime type"
                  required
                  style={{ marginTop: "0.25rem" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Location</label>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Bengaluru" style={{ marginTop: "0.25rem" }} />
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Incident Date</label>
                <input type="date" value={form.incidentDate} onChange={(e) => setForm({ ...form, incidentDate: e.target.value })} style={{ marginTop: "0.25rem" }} />
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Priority</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={{ marginTop: "0.25rem" }}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} style={{ marginTop: "0.25rem", resize: "vertical" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button type="submit" className="btn btn-primary">Create Case</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        )}

        {loading ? (
          <p style={{ color: "var(--text-secondary)" }}>Loading cases...</p>
        ) : cases.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>No cases found. Create your first investigation case.</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> Create First Case</button>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Case Number</th>
                  <th>Crime Type</th>
                  <th>Location</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Officer</th>
                  <th>Evidence</th>
                  <th>Entities</th>
                  <th>Alerts</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/cases/${c.id}`} style={{ color: "var(--accent)", fontWeight: 600 }}>{c.caseNumber}</Link></td>
                    <td>{c.crimeType}</td>
                    <td>{c.location ?? "—"}</td>
                    <td><span className={`badge badge-${c.priority.toLowerCase()}`}>{c.priority}</span></td>
                    <td>{c.status.replace(/_/g, " ")}</td>
                    <td>{c.investigatingOfficer?.name ?? "—"}</td>
                    <td>{c._count.evidence}</td>
                    <td>{c._count.entities}</td>
                    <td>{c._count.alerts}</td>
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
