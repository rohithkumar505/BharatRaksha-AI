import { prisma } from "@bharat-raksha/database";
import { processEvidence } from "../apps/web/src/lib/ingestion";

async function main() {
  const stale = await prisma.ingestionJob.findMany({
    where: { status: { in: ["PENDING", "FAILED"] } },
    take: 50,
    orderBy: { createdAt: "asc" },
  });
  console.log(`Processing ${stale.length} pending/failed jobs...`);
  for (const j of stale) {
    try {
      await processEvidence(j.evidenceId, j.id);
      console.log(`✓ ${j.id}`);
    } catch (e) {
      console.error(`✗ ${j.id}`, e);
    }
  }

  // Orphan evidence: PENDING status but no ingestion job
  const orphans = await prisma.evidence.findMany({
    where: { ingestionStatus: "PENDING", ingestionJobs: { none: {} } },
    take: 20,
  });
  for (const ev of orphans) {
    const job = await prisma.ingestionJob.create({
      data: { evidenceId: ev.id, status: "PENDING" },
    });
    try {
      await processEvidence(ev.id, job.id);
      console.log(`✓ orphan recovered ${ev.fileName}`);
    } catch (e) {
      console.error(`✗ orphan ${ev.id}`, e);
    }
  }

  const rows = await prisma.$queryRaw<
    Array<{ ingestionStatus: string; c: number }>
  >`SELECT "ingestionStatus", count(*)::int as c FROM "Evidence" GROUP BY 1`;
  console.log("Evidence status:", rows);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
