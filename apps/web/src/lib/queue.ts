import { Queue, Worker } from "bullmq";
import { getRedis } from "./redis";
import { processEvidence } from "./ingestion";
import { logger } from "./logger";
import { prisma } from "./db";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  connectTimeout: 5000,
  maxRetriesPerRequest: 1,
};

let ingestionQueue: Queue | null = null;
let worker: Worker | null = null;

export function getIngestionQueue(): Queue {
  if (!ingestionQueue) {
    ingestionQueue = new Queue("evidence-ingestion", { connection });
  }
  return ingestionQueue;
}

export function startIngestionWorker() {
  if (worker) return worker;

  worker = new Worker(
    "evidence-ingestion",
    async (job) => {
      const { evidenceId, jobId } = job.data as {
        evidenceId: string;
        jobId: string;
      };
      logger.info("Processing ingestion job", { evidenceId, jobId });
      await processEvidence(evidenceId, jobId);
    },
    { connection, concurrency: 2 }
  );

  worker.on("failed", (job, err) => {
    logger.error("Ingestion job failed", {
      jobId: job?.id,
      error: err.message,
    });
  });

  recoverStaleIngestionJobs().catch((err) => {
    logger.error("Stale ingestion recovery failed", { error: err.message });
  });

  return worker;
}

/** Process ingestion jobs left PENDING when worker was offline. */
export async function recoverStaleIngestionJobs() {
  const stale = await prisma.ingestionJob.findMany({
    where: { status: { in: ["PENDING", "FAILED"] } },
    select: { id: true, evidenceId: true },
    take: 50,
    orderBy: { createdAt: "asc" },
  });
  if (stale.length === 0) return 0;

  logger.info(`Recovering ${stale.length} stale ingestion job(s)`);
  for (const job of stale) {
    processEvidence(job.evidenceId, job.id).catch((err) => {
      logger.error("Recovery ingestion failed", { jobId: job.id, error: err.message });
    });
  }
  return stale.length;
}

export async function enqueueIngestion(evidenceId: string, jobId: string) {
  try {
    const queue = getIngestionQueue();
    await queue.add(
      "process",
      { evidenceId, jobId },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
    );
    return true;
  } catch {
    return false;
  }
}
