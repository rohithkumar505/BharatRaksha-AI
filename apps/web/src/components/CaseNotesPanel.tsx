"use client";

import { useState } from "react";

interface Note {
  id: string;
  content: string;
  createdAt: string;
  author: { name: string; role?: string };
}

interface Props {
  caseId: string;
  notes: Note[];
  onAdded: () => void;
}

export function CaseNotesPanel({ caseId, notes, onAdded }: Props) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/cases/${caseId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      setContent("");
      onAdded();
    }
    setSaving(false);
  }

  return (
    <div className="card">
      <h2 style={{ fontWeight: 600, marginBottom: "1rem" }}>Investigator Notes</h2>
      <form onSubmit={handleSubmit} style={{ marginBottom: "1rem" }}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add investigation note (case diary entry)..."
          rows={3}
          style={{ marginBottom: "0.5rem", resize: "vertical" }}
        />
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving..." : "Add Note"}
        </button>
      </form>
      {notes.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>No notes yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {notes.map((note) => (
            <div key={note.id} style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.8rem" }}>{note.author.name}</span>
                <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                  {new Date(note.createdAt).toLocaleString("en-IN")}
                </span>
              </div>
              <p style={{ fontSize: "0.875rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{note.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
