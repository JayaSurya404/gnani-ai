import pg from "pg";
import { CallAnalysisWorker, type DbQueryRunner } from "./call-analysis-worker";

/**
 * Initializes and starts the background call analysis queue worker daemon.
 */
export async function createWorkerRunner() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn(
      "[CallAnalysisWorker] Missing SUPABASE_DB_URL / DATABASE_URL. Background queue worker daemon is offline."
    );
    return null;
  }

  const pool = new pg.Pool({
    connectionString: dbUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  const runner: DbQueryRunner = {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const res = await pool.query(sql, params);
      return { rows: res.rows as T[] };
    },
  };

  const workerId =
    process.env.WORKER_ID || `worker-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;
  const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS || 3000);
  const leaseSeconds = Number(process.env.WORKER_LEASE_SECONDS || 300);

  const worker = new CallAnalysisWorker(runner, {
    workerId,
    leaseSeconds,
  });

  console.log(
    `[CallAnalysisWorker] Worker ${workerId} active. Polling outbox queue every ${pollIntervalMs}ms (lease: ${leaseSeconds}s)...`
  );

  const shutdown = async (signal: string) => {
    console.log(`[CallAnalysisWorker] Received ${signal}. Initiating graceful worker shutdown...`);
    worker.stop();
    try {
      await pool.end();
    } catch {
      // Ignore cleanup error
    }
    console.log(`[CallAnalysisWorker] Worker ${workerId} stopped cleanly.`);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await worker.start(pollIntervalMs);
  return worker;
}

// Run directly if invoked via CLI
if (process.argv[1] && (process.argv[1].endsWith("run-worker.ts") || process.argv[1].endsWith("run-worker.js"))) {
  createWorkerRunner().catch((err) => {
    console.error("[CallAnalysisWorker] Fatal runner crash:", err);
    process.exit(1);
  });
}

