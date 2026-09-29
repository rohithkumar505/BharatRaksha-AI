import { prisma } from "@bharat-raksha/database";
import { processEvidence } from "../../apps/web/src/lib/ingestion";

/** Wait for BullMQ worker, or process inline if still pending after timeout. */
export async function ensureEvidenceProcessed(evidenceId: string, jobId: string, maxWaitMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const job = await prisma.ingestionJob.findUnique({ where: { id: jobId } });
    if (job?.status === "COMPLETED") return;
    if (job?.status === "FAILED") throw new Error(job.error ?? "Ingestion failed");
    await new Promise((r) => setTimeout(r, 1000));
  }
  await processEvidence(evidenceId, jobId);
}
