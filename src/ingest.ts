import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSources } from "./sources/index.js";
import type { IngestMeta, Job, SourceResult } from "./types.js";
import { parseArgs } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

async function runSource(
  sourceName: string,
  fetchJobs: (opts?: { limit?: number }) => Promise<Job[]>,
  limit?: number,
): Promise<SourceResult> {
  const started = Date.now();
  try {
    const jobs = await fetchJobs({ limit });
    console.log(
      `  ✓ ${sourceName}: ${jobs.length} jobs (${Date.now() - started}ms)`,
    );
    return { source: sourceName, jobs, fetched: jobs.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${sourceName}: ${message}`);
    return { source: sourceName, jobs: [], fetched: 0, error: message };
  }
}

function dedupe(jobs: Job[]): Job[] {
  const map = new Map<string, Job>();
  for (const job of jobs) {
    map.set(job.id, job);
  }
  return [...map.values()];
}

async function main() {
  const { limit, sources: sourceFilter } = parseArgs(process.argv.slice(2));
  const sources = getSources(sourceFilter);

  console.log("Job Aggregator — ingest to JSON");
  console.log(
    `Sources: ${sources.map((s) => s.name).join(", ")}${
      limit ? ` | limit/source: ${limit}` : ""
    }`,
  );
  console.log("---");

  const startedAt = Date.now();
  const results: SourceResult[] = [];

  // Serial fetches — be polite to free APIs
  for (const source of sources) {
    results.push(await runSource(source.name, source.fetchJobs, limit));
  }

  const allJobs = dedupe(results.flatMap((r) => r.jobs));
  // Newest first when postedAt is present
  allJobs.sort((a, b) => {
    const ta = a.postedAt ? Date.parse(a.postedAt) : 0;
    const tb = b.postedAt ? Date.parse(b.postedAt) : 0;
    return tb - ta;
  });

  const meta: IngestMeta = {
    lastRunAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    totalJobs: allJobs.length,
    sources: results.map((r) => ({
      source: r.source,
      fetched: r.fetched,
      kept: r.jobs.length,
      ...(r.error ? { error: r.error } : {}),
    })),
  };

  await mkdir(DATA_DIR, { recursive: true });

  const jobsPath = path.join(DATA_DIR, "jobs.json");
  const metaPath = path.join(DATA_DIR, "meta.json");
  const samplePath = path.join(DATA_DIR, "sample.json");

  await writeFile(jobsPath, JSON.stringify(allJobs, null, 2), "utf8");
  await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
  // Small preview file for quick inspection
  await writeFile(
    samplePath,
    JSON.stringify(allJobs.slice(0, 5), null, 2),
    "utf8",
  );

  console.log("---");
  console.log(`Wrote ${allJobs.length} jobs → ${path.relative(ROOT, jobsPath)}`);
  console.log(`Meta → ${path.relative(ROOT, metaPath)}`);
  console.log(`Sample (5) → ${path.relative(ROOT, samplePath)}`);
  console.log(`Duration: ${meta.durationMs}ms`);

  const failed = results.filter((r) => r.error);
  if (failed.length === results.length) {
    process.exitCode = 1;
    console.error("All sources failed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
