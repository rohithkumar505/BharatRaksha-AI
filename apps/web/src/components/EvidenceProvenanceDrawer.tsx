"use client";

import Link from "next/link";
import { FileText, Shield, X, ExternalLink } from "lucide-react";

interface Provenance {
  relationshipId: string;
  relationType: string;
  recordRef?: string;
  confidence?: number;
  approved?: boolean;
  sourceFile?: string;
  sourceEntity?: { normalizedValue: string; type: string };
  targetEntity?: { normalizedValue: string; type: string };
  evidence?: {
    id: string;
    fileName: string;
    type: string;
    sha256Hash: string;
    uploadedBy?: { name: string };
    createdAt?: string;
  };
}

interface Props {
  provenance: Provenance;
  caseId: string;
  onClose: () => void;
}

export function EvidenceProvenanceDrawer({ provenance, caseId, onClose }: Props) {
  return (
    <div className="card" style={{ fontSize: "0.85rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <h3 style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <Shield size={14} /> Evidence Provenance
        </h3>
        <button className="btn btn-secondary" onClick={onClose} style={{ padding: "0.2rem" }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ marginBottom: "0.75rem", padding: "0.5rem", background: "var(--bg-secondary)", borderRadius: 6 }}>
        <p style={{ fontWeight: 600, fontSize: "0.8rem" }}>Relationship: {provenance.relationType}</p>
        {provenance.sourceEntity && provenance.targetEntity && (
          <p style={{ fontSize: "0.75rem", marginTop: 4 }}>
            {provenance.sourceEntity.normalizedValue} → {provenance.targetEntity.normalizedValue}
          </p>
        )}
      </div>

      {provenance.confidence != null && (
        <p><strong>Confidence:</strong> {Math.round(provenance.confidence * 100)}%</p>
      )}
      <p>
        <strong>Approved:</strong>{" "}
        <span style={{ color: provenance.approved ? "var(--success)" : "var(--warning)" }}>
          {provenance.approved ? "Yes" : "Pending review"}
        </span>
      </p>
      {provenance.recordRef && (
        <p><strong>Record Ref:</strong> <code style={{ fontSize: "0.7rem" }}>{provenance.recordRef}</code></p>
      )}
      {provenance.sourceFile && (
        <p><strong>Source File:</strong> {provenance.sourceFile}</p>
      )}

      {provenance.evidence && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "rgba(59,130,246,0.05)",
          }}
        >
          <h4 style={{ fontWeight: 600, fontSize: "0.8rem", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: 4 }}>
            <FileText size={12} /> Source Evidence
          </h4>
          <p><strong>File:</strong> {provenance.evidence.fileName}</p>
          <p><strong>Type:</strong> {provenance.evidence.type}</p>
          {provenance.evidence.uploadedBy && (
            <p><strong>Uploaded by:</strong> {provenance.evidence.uploadedBy.name}</p>
          )}
          <p style={{ fontFamily: "monospace", fontSize: "0.65rem", wordBreak: "break-all" }}>
            SHA-256: {provenance.evidence?.sha256Hash ? `${String(provenance.evidence.sha256Hash).slice(0, 32)}...` : "—"}
          </p>
          <Link
            href={`/cases/${caseId}?tab=evidence`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginTop: "0.5rem",
              fontSize: "0.75rem",
              color: "var(--accent)",
            }}
          >
            <ExternalLink size={10} /> View in Evidence tab
          </Link>
        </div>
      )}

      {!provenance.evidence && (
        <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
          No linked evidence file. Relationship may be inferred from entity extraction.
        </p>
      )}
    </div>
  );
}
