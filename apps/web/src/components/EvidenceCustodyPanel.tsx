"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Shield,
  Download,
  ArrowRightLeft,
  Link2,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
} from "lucide-react";

interface CustodyEvent {
  id: string;
  event: string;
  timestamp: string;
  officer: { name: string; email: string; badgeNumber?: string | null };
  details?: string | null;
  hashAtEvent?: string | null;
  ipAddress?: string | null;
  transferStatus?: string;
  recipient?: { name: string } | null;
  ledger?: {
    blockIndex: number;
    blockHash: string;
    previousHash: string;
    onChainTxId?: string | null;
  } | null;
}

interface Officer {
  id: string;
  name: string;
  email: string;
  badgeNumber?: string | null;
}

interface Props {
  evidenceId: string;
  fileName: string;
  sha256Hash: string;
  blockHash?: string | null;
  canTransfer?: boolean;
}

const EVENT_LABELS: Record<string, string> = {
  COLLECTED: "Collected",
  UPLOADED: "Uploaded",
  VIEWED: "Viewed",
  ACCESSED: "Accessed",
  EXPORTED: "Exported",
  TRANSFERRED: "Transferred",
  VERIFIED: "Verified",
  MODIFIED: "Modified",
  ARCHIVED: "Archived",
};

const EVENT_COLORS: Record<string, string> = {
  UPLOADED: "var(--accent)",
  VIEWED: "var(--text-secondary)",
  EXPORTED: "var(--warning)",
  TRANSFERRED: "var(--info)",
  VERIFIED: "var(--success)",
  MODIFIED: "var(--danger)",
};

export function EvidenceCustodyPanel({
  evidenceId,
  fileName,
  sha256Hash,
  blockHash,
  canTransfer = false,
}: Props) {
  const [events, setEvents] = useState<CustodyEvent[]>([]);
  const [chainStatus, setChainStatus] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyResult, setVerifyResult] = useState<Record<string, unknown> | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [canConfirmTransfer, setCanConfirmTransfer] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const loadCustody = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/evidence/${evidenceId}/custody`);
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events ?? []);
      setChainStatus(data.chainStatus ?? null);
    }
    setLoading(false);
  }, [evidenceId]);

  useEffect(() => {
    loadCustody();
    fetch("/api/evidence/custody/pending")
      .then((r) => r.json())
      .then((j) => {
        const pending = (j.pending ?? []) as Array<{ evidenceId: string }>;
        setCanConfirmTransfer(pending.some((p) => p.evidenceId === evidenceId));
      })
      .catch(() => setCanConfirmTransfer(false));
  }, [loadCustody, evidenceId]);

  useEffect(() => {
    if (showTransfer && officers.length === 0) {
      fetch("/api/cases/officers")
        .then((r) => r.json())
        .then(setOfficers)
        .catch(() => {});
    }
  }, [showTransfer, officers.length]);

  async function handleVerify() {
    setVerifying(true);
    const res = await fetch(`/api/evidence/${evidenceId}/verify`);
    const result = await res.json();
    setVerifyResult(result);
    setVerifying(false);
    loadCustody();
  }

  async function handleDownload() {
    window.open(`/api/evidence/${evidenceId}/download`, "_blank");
    setTimeout(loadCustody, 1000);
  }

  async function handleExportBundle() {
    const res = await fetch(`/api/evidence/${evidenceId}/download?format=custody-bundle`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}-custody-bundle.json`;
      a.click();
      URL.revokeObjectURL(url);
      loadCustody();
    }
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!transferTo || !transferReason.trim()) return;
    setTransferring(true);
    const res = await fetch(`/api/evidence/${evidenceId}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: transferTo, reason: transferReason }),
    });
    if (res.ok) {
      setShowTransfer(false);
      setTransferTo("");
      setTransferReason("");
      loadCustody();
    } else {
      const j = await res.json();
      alert(j.error ?? "Transfer failed");
    }
    setTransferring(false);
  }

  async function handleConfirmTransfer() {
    setConfirming(true);
    const res = await fetch(`/api/evidence/${evidenceId}/transfer/confirm`, { method: "POST" });
    if (res.ok) loadCustody();
    else {
      const j = await res.json();
      alert(j.error ?? "Confirm failed");
    }
    setConfirming(false);
  }

  return (
    <div style={{ marginTop: "1rem", padding: "1rem", background: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <h3 style={{ fontWeight: 600, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Link2 size={16} /> Chain of Custody — {fileName}
        </h3>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="btn btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }} onClick={handleVerify} disabled={verifying}>
            {verifying ? <Loader2 size={12} className="spin" /> : <Shield size={12} />}
            Verify
          </button>
          <button className="btn btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }} onClick={handleDownload}>
            <Download size={12} /> Download
          </button>
          <button className="btn btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }} onClick={handleExportBundle}>
            <Eye size={12} /> Custody Bundle
          </button>
          {canTransfer && (
            <button className="btn btn-secondary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }} onClick={() => setShowTransfer(!showTransfer)}>
              <ArrowRightLeft size={12} /> Transfer
            </button>
          )}
          {canConfirmTransfer && (
            <button className="btn btn-primary" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }} onClick={() => void handleConfirmTransfer()} disabled={confirming}>
              {confirming ? "Confirming…" : "Confirm receipt"}
            </button>
          )}
        </div>
      </div>

      <div style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
        SHA-256: {sha256Hash.slice(0, 32)}...
        {blockHash && (
          <div style={{ marginTop: "0.25rem" }}>
            Ledger Block: {blockHash.slice(0, 32)}...
          </div>
        )}
      </div>

      {chainStatus && (
        <div style={{ fontSize: "0.75rem", marginBottom: "0.75rem", color: (chainStatus as { valid?: boolean }).valid ? "var(--success)" : "var(--danger)" }}>
          {(chainStatus as { valid?: boolean }).valid ? "✓" : "✗"} {(chainStatus as { message?: string }).message}
        </div>
      )}

      {verifyResult && (
        <div style={{ marginBottom: "0.75rem", padding: "0.5rem", borderRadius: 6, border: `1px solid ${verifyResult.verified ? "var(--success)" : "var(--danger)"}` }}>
          <p style={{ color: verifyResult.verified ? "var(--success)" : "var(--danger)", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem" }}>
            {verifyResult.verified ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {String(verifyResult.message)}
          </p>
        </div>
      )}

      {showTransfer && (
        <form onSubmit={handleTransfer} style={{ marginBottom: "0.75rem", padding: "0.75rem", border: "1px solid var(--border)", borderRadius: 6 }}>
          <p style={{ fontSize: "0.8rem", marginBottom: "0.5rem", fontWeight: 600 }}>Transfer Custody</p>
          <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} style={{ marginBottom: "0.5rem", width: "100%" }} required>
            <option value="">Select officer...</option>
            {officers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.badgeNumber ?? o.email})
              </option>
            ))}
          </select>
          <textarea
            value={transferReason}
            onChange={(e) => setTransferReason(e.target.value)}
            placeholder="Reason for custody transfer (required)..."
            rows={2}
            style={{ marginBottom: "0.5rem", width: "100%" }}
            required
          />
          <button type="submit" className="btn btn-primary" style={{ fontSize: "0.75rem" }} disabled={transferring}>
            {transferring ? "Recording..." : "Sender confirm & initiate transfer"}
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>Loading custody chain...</p>
      ) : events.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>No custody events recorded yet.</p>
      ) : (
        <div style={{ position: "relative", paddingLeft: "1.25rem" }}>
          <div style={{ position: "absolute", left: "0.35rem", top: 0, bottom: 0, width: 2, background: "var(--border)" }} />
          {events.map((ev, i) => (
            <div key={ev.id} style={{ position: "relative", marginBottom: i < events.length - 1 ? "0.75rem" : 0 }}>
              <div
                style={{
                  position: "absolute",
                  left: "-1rem",
                  top: "0.35rem",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: EVENT_COLORS[ev.event] ?? "var(--text-secondary)",
                }}
              />
              <div style={{ fontSize: "0.75rem" }}>
                <span style={{ fontWeight: 600, color: EVENT_COLORS[ev.event] }}>
                  {EVENT_LABELS[ev.event] ?? ev.event}
                </span>
                <span style={{ color: "var(--text-secondary)", marginLeft: "0.5rem" }}>
                  {new Date(ev.timestamp).toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                {ev.officer.name}
                {ev.officer.badgeNumber && ` • Badge ${ev.officer.badgeNumber}`}
              </div>
              {ev.details && (
                <div style={{ fontSize: "0.7rem", marginTop: "0.15rem" }}>{ev.details}</div>
              )}
              {ev.transferStatus === "PENDING_RECIPIENT" && (
                <div style={{ fontSize: "0.65rem", color: "var(--warning)" }}>Awaiting recipient confirmation</div>
              )}
              {ev.ledger && (
                <div style={{ fontSize: "0.65rem", fontFamily: "monospace", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                  Block #{ev.ledger.blockIndex} • {String(ev.ledger.blockHash ?? "").slice(0, 20)}...
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
