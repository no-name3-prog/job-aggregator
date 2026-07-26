/**
 * Apply 15-day (configurable) retention:
 * 1) Prune Mongo / local store jobs
 * 2) Prune committed JSON dumps under data/
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getStore } from "../db/index.js";
import {
  filterFreshJobs,
  getRetentionDays,
} from "../db/retention.js";
import type { CompanySummary } from "../types.js";
import type { Job } from "../types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function pruneJsonFile(rel: string, days: number): Promise<number> {
  const full = path.join(ROOT, rel);
  try {
    const raw = await readFile(full, "utf8");
    const jobs = JSON.parse(raw) as Job[];
    if (!Array.isArray(jobs)) return 0;
    const { kept, removed, cutoffIso } = filterFreshJobs(jobs, days);
    if (removed > 0) {
      await writeFile(full, JSON.stringify(kept, null, 2) + "\n", "utf8");
      console.log(`  JSON ${rel}: removed ${removed}, kept ${kept.length} (cutoff ${cutoffIso})`);
    } else {
      console.log(`  JSON ${rel}: nothing to prune (kept ${kept.length})`);
    }
    return removed;
  } catch {
    console.log(`  JSON ${rel}: skip (missing)`);
    return 0;
  }
}

function rebuildCompanies(jobs: Job[]): CompanySummary[] {
  const map = new Map<
    string,
    {
      jobCount: number;
      sources: Set<string>;
      locations: Set<string>;
      titles: string[];
      urls: string[];
    }
  >();
  for (const job of jobs) {
    const key = job.company.trim() || "Unknown";
    let row = map.get(key);
    if (!row) {
      row = {
        jobCount: 0,
        sources: new Set(),
        locations: new Set(),
        titles: [],
        urls: [],
      };
      map.set(key, row);
    }
    row.jobCount += 1;
    row.sources.add(job.source);
    if (job.location) row.locations.add(job.location);
    if (row.titles.length < 8) row.titles.push(job.title);
    if (row.urls.length < 5) row.urls.push(job.url);
  }
  return [...map.entries()]
    .map(([company, row]) => ({
      company,
      jobCount: row.jobCount,
      sources: [...row.sources].sort(),
      locations: [...row.locations].slice(0, 20),
      sampleTitles: row.titles,
      officialUrls: row.urls,
    }))
    .sort((a, b) => b.jobCount - a.jobCount || a.company.localeCompare(b.company));
}

async function main() {
  const days = getRetentionDays();
  console.log(`Retention policy: remove jobs older than ${days} days`);

  // 1) DB / file store
  const store = await getStore();
  const dbResult = await store.pruneStaleJobs(days);
  console.log(
    `  Store: removed ${dbResult.removed} (cutoff ${dbResult.cutoffIso})`,
  );
  await store.close();

  // 2) JSON dumps used by CI / git
  let jsonRemoved = 0;
  jsonRemoved += await pruneJsonFile("data/jobs.json", days);
  jsonRemoved += await pruneJsonFile("data/sample.json", days);
  jsonRemoved += await pruneJsonFile("data/data-engineer/jobs.json", days);
  jsonRemoved += await pruneJsonFile("data/data-engineer/sample.json", days);

  // Rebuild DE companies + sample from pruned jobs
  try {
    const dePath = path.join(ROOT, "data/data-engineer/jobs.json");
    const deJobs = JSON.parse(await readFile(dePath, "utf8")) as Job[];
    if (Array.isArray(deJobs)) {
      const companies = rebuildCompanies(deJobs);
      await writeFile(
        path.join(ROOT, "data/data-engineer/companies.json"),
        JSON.stringify(companies, null, 2) + "\n",
        "utf8",
      );
      await writeFile(
        path.join(ROOT, "data/data-engineer/sample.json"),
        JSON.stringify(deJobs.slice(0, 10), null, 2) + "\n",
        "utf8",
      );
      // update sample for general jobs
      try {
        const all = JSON.parse(
          await readFile(path.join(ROOT, "data/jobs.json"), "utf8"),
        ) as Job[];
        if (Array.isArray(all)) {
          await writeFile(
            path.join(ROOT, "data/sample.json"),
            JSON.stringify(all.slice(0, 5), null, 2) + "\n",
            "utf8",
          );
        }
      } catch {
        /* ignore */
      }
      console.log(`  Rebuilt data/data-engineer/companies.json (${companies.length} companies)`);
    }
  } catch {
    /* no DE file */
  }

  console.log(
    `Done. Store removed=${dbResult.removed}, JSON removed≈${jsonRemoved}, retentionDays=${days}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
