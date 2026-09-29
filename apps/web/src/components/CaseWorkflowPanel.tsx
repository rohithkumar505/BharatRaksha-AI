"use client";

import { useEffect, useState } from "react";

interface Officer {
  id: string;
  name: string;
  badgeNumber: string | null;
}

interface Props {
  caseId: string;
  currentStatus: string;
  currentPriority: string;
  currentOfficerId: string | null;
  canAssign: boolean;
  onUpdated: () => void;
}

export function CaseWorkflowPanel({
  caseId,
  currentStatus,
  currentPriority,
  currentOfficerId,
  canAssign,
  onUpdated,
}: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [priority, setPriority] = useState(currentPriority);
  const [officerId, setOfficerId] = useState(currentOfficerId ?? "");
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setStatus(currentStatus);
    setPriority(currentPriority);
    setOfficerId(currentOfficerId ?? "");
  }, [currentStatus, currentPriority, currentOfficerId]);

  useEffect(() => {
    if (canAssign) {
      fetch("/api/cases/officers").then((r) => r.json()).then(setOfficers);
    }
  }, [canAssign]);

  async function save(fields: Record<string, string>) {
    setSaving(true);
    setMsg("");
    const res = await fetch(`/api/cases/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      setMsg("Updated successfully");
      onUpdated();
    } else {
      const err = await res.json();
      setMsg(err.error ?? "Update failed");
    }
    setSaving(false);
  }

  return (
    <div className="card">
      <h2 style={{ fontWeight: 600, marginBottom: "1rem" }}>Case Workflow</h2>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ marginTop: "0.25rem" }}>
            <option value="OPEN">Open</option>
            <option value="UNDER_INVESTIGATION">Under Investigation</option>
            <option value="PENDING_REVIEW">Pending Review</option>
            <option value="CLOSED">Closed</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <button className="btn btn-secondary" style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }} disabled={saving} onClick={() => save({ status })}>
            Save Status
          </button>
        </div>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ marginTop: "0.25rem" }}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
          <button className="btn btn-secondary" style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }} disabled={saving} onClick={() => save({ priority })}>
            Save Priority
          </button>
        </div>
        {canAssign && (
          <div>
            <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Investigating Officer</label>
            <select value={officerId} onChange={(e) => setOfficerId(e.target.value)} style={{ marginTop: "0.25rem" }}>
              <option value="">Unassigned</option>
              {officers.map((o) => (
                <option key={o.id} value={o.id}>{o.name} {o.badgeNumber ? `(${o.badgeNumber})` : ""}</option>
              ))}
            </select>
            <button className="btn btn-secondary" style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }} disabled={saving} onClick={() => save({ investigatingOfficerId: officerId })}>
              Assign
            </button>
          </div>
        )}
      </div>
      {msg && <p style={{ fontSize: "0.8rem", marginTop: "0.75rem", color: "var(--text-secondary)" }}>{msg}</p>}
    </div>
  );
}
