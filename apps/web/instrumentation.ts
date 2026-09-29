export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ENABLE_INGESTION_WORKER !== "false") {
    const { startIngestionWorker } = await import("./src/lib/queue");
    startIngestionWorker();
  }
}
