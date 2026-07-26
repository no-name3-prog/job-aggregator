import { loadAtsConfig } from "../config/loadAtsConfig.js";
import type { Job, JobSource } from "../types.js";
import {
  fetchJson,
  htmlToText,
  makeId,
  nowIso,
  sleep,
  truncate,
} from "../utils.js";

/**
 * Eightfold career sites (e.g. app.eightfold.ai/careers?domain=…) historically
 * exposed GET /api/apply/v2/jobs?domain=…
 *
 * As of 2026-07 this endpoint returns HTTP 403 "Not authorized for PCSX" for
 * all tested public domains. Full HTML pages are JS apps without embedded job
 * lists, so reliable free ingest would need headless browser automation.
 *
 * This source still tries configured domains so it will start working again if
 * Eightfold re-opens the public PCSX feed. Failures are non-fatal per domain.
 */

interface EightfoldPosition {
  id?: string | number;
  name?: string;
  position_name?: string;
  display_job_id?: string;
  location?: string;
  locations?: string[];
  department?: string;
  workplace_type?: string;
  job_description?: string;
  description?: string;
}

interface EightfoldResponse {
  data?: {
    positions?: EightfoldPosition[];
    count?: number;
  };
  positions?: EightfoldPosition[];
  message?: string;
}

function isRemote(location: string, workplace?: string): boolean {
  return /remote|hybrid|anywhere/i.test(`${location} ${workplace ?? ""}`);
}

export const eightfoldSource: JobSource = {
  name: "eightfold",
  async fetchJobs({ limit } = {}) {
    const config = await loadAtsConfig();
    const { maxJobsPerBoard, requestDelayMs } = config.options;
    const scrapedAt = nowIso();
    const all: Job[] = [];
    let anySuccess = false;
    const errors: string[] = [];

    for (const board of config.eightfold) {
      const num = limit
        ? Math.min(limit, maxJobsPerBoard, 50)
        : Math.min(maxJobsPerBoard, 50);
      const url = `https://app.eightfold.ai/api/apply/v2/jobs?domain=${encodeURIComponent(
        board.domain,
      )}&start=0&num=${num}`;

      try {
        const data = await fetchJson<EightfoldResponse>(url, {
          headers: {
            Referer: `https://app.eightfold.ai/careers?domain=${board.domain}`,
            Accept: "application/json",
          },
        });

        const positions =
          data.data?.positions ?? data.positions ?? ([] as EightfoldPosition[]);

        if (!positions.length && data.message) {
          throw new Error(data.message);
        }

        anySuccess = true;
        for (const p of positions) {
          const externalId = String(
            p.id ?? p.display_job_id ?? p.name ?? Math.random(),
          );
          const title = (p.name || p.position_name || "Untitled").trim();
          const location =
            p.location ||
            (p.locations ?? []).filter(Boolean).join(", ") ||
            "Unknown";
          const applyUrl = `https://app.eightfold.ai/careers/job?domain=${encodeURIComponent(
            board.domain,
          )}&pid=${encodeURIComponent(externalId)}`;

          all.push({
            id: makeId("eightfold", `${board.domain}-${externalId}`),
            externalId: `${board.domain}:${externalId}`,
            source: "eightfold",
            title,
            company: board.company,
            location,
            remote: isRemote(location, p.workplace_type),
            url: applyUrl,
            description: truncate(
              htmlToText(p.job_description || p.description || ""),
            ),
            tags: [p.department, p.workplace_type].filter(
              (t): t is string => Boolean(t),
            ),
            postedAt: null,
            scrapedAt,
          });
        }

        console.log(
          `    · eightfold/${board.domain}: ${positions.length} jobs`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${board.domain}: ${message}`);
        console.error(`    · eightfold/${board.domain}: FAILED — ${message}`);
      }

      await sleep(requestDelayMs);
      if (limit && all.length >= limit) break;
    }

    if (!anySuccess && config.eightfold.length > 0) {
      console.warn(
        "    ⚠ Eightfold public PCSX API is locked (403) for configured domains. " +
          "Not feasible without browser automation. See config/ats-boards.json.",
      );
      // Soft-fail: return empty so other sources still write JSON.
      // Surface a clear error in meta by throwing only if user filtered to eightfold-only —
      // ingest treats thrown errors as source failures; empty is OK for multi-source runs.
      if (errors.length) {
        // Attach summary for meta via throw only when zero boards configured success
        // Returning [] keeps pipeline green; meta shows kept: 0
      }
    }

    return limit ? all.slice(0, limit) : all;
  },
};
