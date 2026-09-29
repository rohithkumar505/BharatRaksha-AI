"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Download, Link2, Loader2 } from "lucide-react";

type TimelineEvent = {
  id: string;
  event: string;
  eventLabel: string;
  timestamp: string;
  actor: { name: string; email: string; badgeNumber?: string | null };
  recipient?: { name: string } | null;
  details?: string | null;
  transferStatus: string;
  senderConfirmedAt?: string | null;
  recipientConfirmedAt?: string | null;
  chain?: {
    blockIndex: number;
    previousEventHash: string;
    currentEventHash: string;
  } | null;
};

type Timeline = {
  chainVerified: boolean;
  chainMessage: string;
  events: TimelineEvent[];
  document: { fileName: string; registerNumber: string | null; sha256Hash: string };
};

export function LegalVerifiableCustodyTimeline({
  caseId,
  evidenceId,
}: {
  caseId: string;
  evidenceId: string;
}) {
  const [data, setData] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [canConfirmTransfer, setCanConfirmTransfer] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/cases/${caseId}/legal-documents/${evidenceId}/custody-timeline`);
    if (res.ok) setData(await res.json());
    else setData(null);
    setLoading(false);
  }, [caseId, evidenceId]);

  useEffect(() => {
    void load();
    fetch("/api/evidence/custody/pending")
      .then((r) => r.json())
      .then((j) => {
        const pending = (j.pending ?? []) as Array<{ evidenceId: string }>;
        setCanConfirmTransfer(pending.some((p) => p.evidenceId === evidenceId));
      })
      .catch(() => setCanConfirmTransfer(false));
  }, [load, evidenceId]);

  async function confirmTransfer() {
    setConfirming(true);
    setMsg("");
    const res = await fetch(`/api/evidence/${evidenceId}/transfer/confirm`, { method: "POST" });
    const j = await res.json();
    setMsg(res.ok ? j.message : j.error ?? "Failed");
    setConfirming(false);
    void load();
  }

  const hasPendingForViewer = canConfirmTransfer;

  return (
    <div
      style={{
        marginTop: "1rem",
        padding: "1rem",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--bg-secondary)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <h4 style={{ fontWeight: 700, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 6 }}>
          <Link2 size={16} /> Verifiable chain-of-custody timeline
        </h4>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <a
            className="btn btn-secondary"
            style={{ fontSize: "0.72rem" }}
            href={`/api/cases/${caseId}/legal-documents/${evidenceId}/custody-timeline?format=html`}
            target="_blank"
            rel="noreferrer"
          >
            <Download size={12} /> Export report
          </a>
          {hasPendingForViewer && (
            <button type="button" className="btn btn-primary" style={{ fontSize: "0.72rem" }} disabled={confirming} onClick={() => void confirmTransfer()}>
              {confirming ? <Loader2 size={12} className="spin" /> : <CheckCircle size={12} />}
              Confirm transfer (recipient)
            </button>
          )}
        </div>
      </div>

      {data && (
        <p style={{ fontSize: "0.75rem", color: data.chainVerified ? "var(--success)" : "var(--warning)", marginBottom: "0.65rem" }}>
          {data.chainVerified ? "✓" : "!"} {data.chainMessage}
        </p>
      )}
      {msg && <p style={{ fontSize: "0.75rem", marginBottom: "0.5rem" }}>{msg}</p>}

      {loading ? (
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Loading custody chain…</p>
      ) : !data?.events.length ? (
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>No custody events yet — upload or access this document.</p>
      ) : (
        <div style={{ position: "relative", paddingLeft: "1.25rem", maxHeight: 280, overflow: "auto" }}>
          <div style={{ position: "absolute", left: "0.35rem", top: 0, bottom: 0, width: 2, background: "var(--border)" }} />
          {data.events.map((ev, i) => (
            <div key={ev.id} style={{ position: "relative", marginBottom: i < data.events.length - 1 ? "0.85rem" : 0 }}>
              <div
                style={{
                  position: "absolute",
                  left: "-1rem",
                  top: "0.35rem",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "var(--saffron)",
                }}
              />
              <div style={{ fontSize: "0.78rem" }}>
                <strong>{ev.eventLabel}</strong>
                <span style={{ color: "var(--text-secondary)", marginLeft: 8 }}>{new Date(ev.timestamp).toLocaleString()}</span>
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                {ev.actor.name}
                {ev.recipient ? ` → ${ev.recipient.name}` : ""}
                {ev.transferStatus === "PENDING_RECIPIENT" && (
                  <span style={{ color: "var(--warning)", marginLeft: 6 }}>(awaiting recipient)</span>
                )}
                {ev.transferStatus === "CONFIRMED" && ev.recipientConfirmedAt && (
                  <span style={{ color: "var(--success)", marginLeft: 6 }}>(dual-confirmed)</span>
                )}
              </div>
              {ev.chain && (
                <div style={{ fontSize: "0.65rem", fontFamily: "monospace", color: "var(--text-secondary)", marginTop: 2 }}>
                  #{ev.chain.blockIndex} · prev {ev.chain.previousEventHash.slice(0, 10)}… → {ev.chain.currentEventHash.slice(0, 10)}…
                </div>
              )}
              {ev.details && <div style={{ fontSize: "0.7rem", marginTop: 2 }}>{ev.details}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
