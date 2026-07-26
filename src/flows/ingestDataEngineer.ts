/**
 * Data Engineer discovery flow
 * --------------------------
 * 1. Pull listings from free boards + official company ATS APIs
 *    (Greenhouse, Workday, Lever, Ashby career endpoints — not random HTML scrapes)
 * 2. Keep only titles that match Data Engineer–related roles
 * 3. Optionally enrich Greenhouse matches with full job content
 * 4. Write:
 *    - data/data-engineer/jobs.json
 *    - data/data-engineer/companies.json  (companies that currently have DE roles)
 *    - data/data-engineer/meta.json
 *    - data/data-engineer/sample.json
 *
 * Honest scope: not every company on Earth — free APIs + configured official boards.
 * Expand coverage by adding boards in config/ats-boards.json.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DATA_ENGINEER_SEARCH_PHRASES,
  matchesDataEngineerRole,
} from "../matching/dataEngineer.js";
import { arbeitnowSource } from "../sources/arbeitnow.js";
import { ashbySource } from "../sources/ashby.js";
import {
  fetchGreenhouseJobDetail,
  greenhouseSource,
} from "../sources/greenhouse.js";
import { jobicySource } from "../sources/jobicy.js";
import { leverSource } from "../sources/lever.js";
import { remoteokSource } from "../sources/remoteok.js";
import { remotiveSource } from "../sources/remotive.js";
import { workdaySource } from "../sources/workday.js";
import type { CompanySummary, Job, SourceResult } from "../types.js";
import { parseArgs, sleep } from "../utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(ROOT, "data", "data-engineer");

/** Full board scan caps (DE flow wants discovery, not first-100 only). */
const BOARD_SCAN_CAP = 5000;
const WORKDAY_SEARCH_CAP = 250;
const GH_DETAIL_CAP = 80; // max Greenhouse jobs to enrich with full description

function dedupe(jobs: Job[]): Job[] {
  const map = new Map<string, Job>();
  for (const job of jobs) {
    const existing = map.get(job.id);
    if (!existing) {
      map.set(job.id, job);
      continue;
    }
    // Prefer the copy that has a description
    if (!existing.description && job.description) {
      map.set(job.id, job);
    }
  }
  return [...map.values()];
}

function filterDe(jobs: Job[]): Job[] {
  return jobs.filter((j) => matchesDataEngineerRole(j.title));
}

async function runLabeled(
  source: string,
  fn: () => Promise<Job[]>,
): Promise<SourceResult> {
  const started = Date.now();
  try {
    const raw = await fn();
    const jobs = filterDe(raw);
    console.log(
      `  ✓ ${source}: ${jobs.length} DE roles (from ${raw.length} listings, ${Date.now() - started}ms)`,
    );
    return { source, jobs, fetched: raw.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${source}: ${message}`);
    return { source, jobs: [], fetched: 0, error: message };
  }
}

function summarizeCompanies(jobs: Job[]): CompanySummary[] {
  const byCompany = new Map<
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
    let row = byCompany.get(key);
    if (!row) {
      row = {
        jobCount: 0,
        sources: new Set(),
        locations: new Set(),
        titles: [],
        urls: [],
      };
      byCompany.set(key, row);
    }
    row.jobCount += 1;
    row.sources.add(job.source);
    if (job.location) row.locations.add(job.location);
    if (row.titles.length < 8) row.titles.push(job.title);
    if (row.urls.length < 5) row.urls.push(job.url);
  }

  return [...byCompany.entries()]
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

async function enrichGreenhouseDetails(jobs: Job[]): Promise<Job[]> {
  const gh = jobs.filter((j) => j.source === "greenhouse");
  const others = jobs.filter((j) => j.source !== "greenhouse");
  const toEnrich = gh.slice(0, GH_DETAIL_CAP);
  const skip = gh.slice(GH_DETAIL_CAP);

  console.log(
    `--- Enriching up to ${toEnrich.length} Greenhouse DE postings with official job content ---`,
  );

  const enriched: Job[] = [];
  for (const job of toEnrich) {
    const [token, id] = job.externalId.split(":");
    if (!token || !id) {
      enriched.push(job);
      continue;
    }
    const detail = await fetchGreenhouseJobDetail(token, id, job.company);
    if (detail && matchesDataEngineerRole(detail.title)) {
      enriched.push({ ...detail, scrapedAt: job.scrapedAt });
    } else {
      enriched.push(job);
    }
    await sleep(150);
  }

  return [...others, ...enriched, ...skip];
}

async function main() {
  const { limit } = parseArgs(process.argv.slice(2));
  console.log("Data Engineer discovery — official ATS + free boards");
  console.log(
    "Scope: configured companies + public job APIs (not every company worldwide).",
  );
  console.log("---");

  const startedAt = Date.now();
  const results: SourceResult[] = [];

  // --- Free aggregator APIs (filter by title) ---
  results.push(
    await runLabeled("remotive", () => remotiveSource.fetchJobs({ limit })),
  );
  results.push(
    await runLabeled("arbeitnow", () => arbeitnowSource.fetchJobs({ limit })),
  );
  results.push(
    await runLabeled("jobicy", () => jobicySource.fetchJobs({ limit })),
  );
  results.push(
    await runLabeled("remoteok", () => remoteokSource.fetchJobs({ limit })),
  );

  // --- Official company Greenhouse boards (full list, no content first) ---
  results.push(
    await runLabeled("greenhouse", () =>
      greenhouseSource.fetchJobs({
        includeContent: false,
        maxPerBoard: BOARD_SCAN_CAP,
        limit,
      }),
    ),
  );

  // --- Official Workday career sites with server-side search ---
  const workdayPool: Job[] = [];
  let workdayFetched = 0;
  for (const phrase of DATA_ENGINEER_SEARCH_PHRASES) {
    try {
      const batch = await workdaySource.fetchJobs({
        searchText: phrase,
        maxPerBoard: WORKDAY_SEARCH_CAP,
      });
      workdayFetched += batch.length;
      workdayPool.push(...batch);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ workday "${phrase}": ${message}`);
    }
  }
  const workdayDe = filterDe(dedupe(workdayPool));
  console.log(
    `  ✓ workday: ${workdayDe.length} DE roles (from ${workdayPool.length} search hits)`,
  );
  results.push({
    source: "workday",
    jobs: workdayDe,
    fetched: workdayFetched,
  });

  // --- Lever / Ashby official posting APIs ---
  results.push(
    await runLabeled("lever", () =>
      leverSource.fetchJobs({ maxPerBoard: BOARD_SCAN_CAP, limit }),
    ),
  );
  results.push(
    await runLabeled("ashby", () =>
      ashbySource.fetchJobs({ maxPerBoard: BOARD_SCAN_CAP, limit }),
    ),
  );

  let allJobs = dedupe(results.flatMap((r) => r.jobs));
  allJobs = await enrichGreenhouseDetails(allJobs);
  allJobs = dedupe(allJobs);

  allJobs.sort((a, b) => {
    const ta = a.postedAt ? Date.parse(a.postedAt) : 0;
    const tb = b.postedAt ? Date.parse(b.postedAt) : 0;
    return tb - ta;
  });

  if (limit) {
    allJobs = allJobs.slice(0, limit);
  }

  const companies = summarizeCompanies(allJobs);

  const meta = {
    flow: "data-engineer",
    lastRunAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    totalJobs: allJobs.length,
    totalCompanies: companies.length,
    titleMatcher:
      "data engineer | analytics engineer | etl/elt | data platform/pipeline/warehouse | …",
    note: "Jobs come from free public APIs and official company ATS endpoints (Greenhouse/Workday/Lever/Ashby). Not an exhaustive list of every employer worldwide. Add boards in config/ats-boards.json to expand.",
    sources: results.map((r) => ({
      source: r.source,
      fetched: r.fetched,
      kept: r.jobs.length,
      ...(r.error ? { error: r.error } : {}),
    })),
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUT_DIR, "jobs.json"),
    JSON.stringify(allJobs, null, 2),
    "utf8",
  );
  await writeFile(
    path.join(OUT_DIR, "companies.json"),
    JSON.stringify(companies, null, 2),
    "utf8",
  );
  await writeFile(
    path.join(OUT_DIR, "meta.json"),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
  await writeFile(
    path.join(OUT_DIR, "sample.json"),
    JSON.stringify(allJobs.slice(0, 10), null, 2),
    "utf8",
  );

  console.log("---");
  console.log(`DE jobs: ${allJobs.length} → data/data-engineer/jobs.json`);
  console.log(
    `Companies with DE roles: ${companies.length} → data/data-engineer/companies.json`,
  );
  console.log(`Meta → data/data-engineer/meta.json`);
  console.log(`Duration: ${meta.durationMs}ms`);
  console.log("Top companies:");
  for (const c of companies.slice(0, 15)) {
    console.log(`  · ${c.company}: ${c.jobCount}  [${c.sources.join(", ")}]`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
