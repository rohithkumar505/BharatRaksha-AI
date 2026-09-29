import { getEvidenceCustodyChain, verifyEvidenceLedgerChain } from "./blockchain";
import { prisma } from "./db";

export const CUSTODY_EVENT_LABELS: Record<string, string> = {
  COLLECTED: "Collection (field / seizure)",
  UPLOADED: "Upload & fingerprint",
  VIEWED: "Viewed",
  ACCESSED: "Accessed",
  EXPORTED: "Exported",
  TRANSFERRED: "Custody transfer",
  VERIFIED: "Integrity verification",
  MODIFIED: "Modified",
  ARCHIVED: "Archived",
};

export function mapCustodyEventToTimelineRow(e: Awaited<ReturnType<typeof getEvidenceCustodyChain>>[number]) {
  const lb = e.ledgerBlock;
  return {
    id: e.id,
    event: e.event,
    eventLabel: CUSTODY_EVENT_LABELS[e.event] ?? e.event,
    timestamp: e.createdAt.toISOString(),
    actor: e.user,
    recipient: e.transferredTo,
    details: e.details,
    hashAtEvent: e.hashAtEvent,
    transferStatus: e.transferStatus,
    senderConfirmedAt: e.senderConfirmedAt?.toISOString() ?? null,
    recipientConfirmedAt: e.recipientConfirmedAt?.toISOString() ?? null,
    chain: lb
      ? {
          blockIndex: lb.blockIndex,
          previousEventHash: lb.previousHash,
          currentEventHash: lb.blockHash,
          onChainTxId: lb.onChainTxId,
        }
      : null,
  };
}

export async function buildVerifiableCustodyTimeline(evidenceId: string) {
  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    select: {
      id: true,
      fileName: true,
      registerNumber: true,
      sha256Hash: true,
      documentStatus: true,
      legalCategory: true,
      caseId: true,
      case: { select: { caseNumber: true } },
    },
  });
  if (!evidence) return null;

  const [chain, verify] = await Promise.all([
    getEvidenceCustodyChain(evidenceId),
    verifyEvidenceLedgerChain(evidenceId),
  ]);

  return {
    feature: "SIH26190_VERIFIABLE_CUSTODY_TIMELINE",
    psAlignment: "SIH26190",
    generatedAt: new Date().toISOString(),
    document: evidence,
    chainVerified: verify.valid,
    chainMessage: verify.message,
    eventCount: chain.length,
    events: chain.map(mapCustodyEventToTimelineRow),
  };
}

export function buildCustodyReportHtml(timeline: NonNullable<Awaited<ReturnType<typeof buildVerifiableCustodyTimeline>>>) {
  const rows = timeline.events
    .map(
      (ev) =>
        `<tr>
          <td>${new Date(ev.timestamp).toLocaleString()}</td>
          <td>${ev.eventLabel}</td>
          <td>${ev.actor.name}${ev.recipient ? ` → ${ev.recipient.name}` : ""}</td>
          <td>${ev.transferStatus !== "NOT_APPLICABLE" ? ev.transferStatus : "—"}</td>
          <td style="font-family:monospace;font-size:10px">${ev.chain?.previousEventHash?.slice(0, 12) ?? "—"}… → ${ev.chain?.currentEventHash?.slice(0, 12) ?? "—"}…</td>
          <td>${(ev.details ?? "").replace(/</g, "&lt;").slice(0, 120)}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Custody Report ${timeline.document.registerNumber ?? timeline.document.fileName}</title>
<style>body{font-family:system-ui;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;font-size:11px}th{background:#f4f4f4}</style></head>
<body>
<h1>Chain-of-Custody Report (Verifiable Transfers)</h1>
<p>SIH26190 · Case ${timeline.document.case?.caseNumber ?? ""} · ${timeline.document.fileName} · Register ${timeline.document.registerNumber ?? "—"}</p>
<p>SHA-256: <code>${timeline.document.sha256Hash}</code></p>
<p>Ledger: ${timeline.chainVerified ? "✓ Verified" : "✗ Check required"} — ${timeline.chainMessage}</p>
<table><thead><tr><th>When</th><th>Event</th><th>Actor</th><th>Transfer</th><th>Hash chain</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table>
<p style="font-size:10px;color:#666">Each event is linked to the previous ledger block hash. Transfers require sender initiation and recipient confirmation.</p>
</body></html>`;
}

export async function recordLegalDocumentArchived(evidenceId: string, userId: string, ipAddress?: string) {
  const { recordCustodyEvent } = await import("./blockchain");
  const doc = await prisma.evidence.findUnique({ where: { id: evidenceId }, select: { sha256Hash: true } });
  if (!doc) return;
  await recordCustodyEvent({
    evidenceId,
    event: "ARCHIVED",
    userId,
    hashAtEvent: doc.sha256Hash,
    details: "Document archived in SIH26190 legal register",
    ipAddress,
    payload: { documentStatus: "ARCHIVED" },
  });
}
