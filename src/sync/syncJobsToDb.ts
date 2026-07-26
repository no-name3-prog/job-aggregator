/**
 * Sync DE jobs (and optionally all jobs) from JSON files into the app store (Mongo or local).
 * Then apply retention: drop jobs older than JOB_RETENTION_DAYS (default 15).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getStore } from "../db/index.js";
import { getRetentionDays } from "../db/retention.js";
import type { Job } from "../types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function loadJson<T>(rel: string): Promise<T | null> {
  try {
    const raw = await readFile(path.join(ROOT, rel), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function main() {
  const store = await getStore();
  const deJobs =
    (await loadJson<Job[]>("data/data-engineer/jobs.json")) ?? [];
  const allJobs = (await loadJson<Job[]>("data/jobs.json")) ?? [];

  let upserted = 0;
  if (allJobs.length) {
    const r = await store.upsertJobs(allJobs, { markDe: false });
    upserted += r.upserted;
    console.log(`Synced ${r.upserted} general jobs`);
  }
  if (deJobs.length) {
    const r = await store.upsertJobs(deJobs, { markDe: true });
    upserted += r.upserted;
    console.log(`Synced ${r.upserted} DE jobs (flagged isDataEngineer)`);
  }

  // Retention: remove stale listings (> N days)
  const days = getRetentionDays();
  const pruned = await store.pruneStaleJobs(days);
  console.log(
    `Pruned ${pruned.removed} stale jobs (older than ${days}d, cutoff ${pruned.cutoffIso})`,
  );

  await store.setMeta("lastJobSyncAt", new Date().toISOString());
  await store.setMeta("lastSyncCounts", {
    general: allJobs.length,
    dataEngineer: deJobs.length,
    pruned: pruned.removed,
    retentionDays: days,
  });

  console.log(`Done. Total upsert operations: ${upserted}`);
  console.log(
    deJobs.length === 0 && allJobs.length === 0
      ? "No JSON found — run npm run ingest:de first."
      : "Store ready for the API/dashboard.",
  );
  await store.close();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
