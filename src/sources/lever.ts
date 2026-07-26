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

interface LeverJob {
  id: string;
  text: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  descriptionPlain?: string;
  description?: string;
  categories?: {
    location?: string;
    commitment?: string;
    team?: string;
    department?: string;
  };
  country?: string;
  workplaceType?: string;
}

function isRemote(location: string, workplace?: string): boolean {
  return /remote|anywhere|distributed/i.test(`${location} ${workplace ?? ""}`);
}

export const leverSource: JobSource = {
  name: "lever",
  async fetchJobs({ limit, maxPerBoard } = {}) {
    const config = await loadAtsConfig();
    const { maxJobsPerBoard, requestDelayMs } = config.options;
    const perBoard = maxPerBoard ?? maxJobsPerBoard;
    const scrapedAt = nowIso();
    const all: Job[] = [];

    for (const board of config.lever) {
      const url = `https://api.lever.co/v0/postings/${encodeURIComponent(
        board.site,
      )}?mode=json`;
      try {
        const jobs = await fetchJson<LeverJob[]>(url);
        let list = Array.isArray(jobs) ? jobs : [];
        list = list.slice(0, perBoard);

        for (const j of list) {
          const location =
            j.categories?.location?.trim() ||
            j.country?.trim() ||
            "Unknown";
          all.push({
            id: makeId("lever", `${board.site}-${j.id}`),
            externalId: `${board.site}:${j.id}`,
            source: "lever",
            title: j.text?.trim() || "Untitled",
            company: board.company,
            location,
            remote: isRemote(location, j.workplaceType),
            url: j.hostedUrl || j.applyUrl || url,
            description: truncate(
              j.descriptionPlain || htmlToText(j.description) || "",
            ),
            tags: [
              j.categories?.team,
              j.categories?.department,
              j.categories?.commitment,
              j.workplaceType,
            ].filter((t): t is string => Boolean(t)),
            jobType: j.categories?.commitment,
            postedAt: j.createdAt
              ? new Date(j.createdAt).toISOString()
              : null,
            scrapedAt,
          });
        }
        console.log(`    · lever/${board.site}: ${list.length} jobs`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`    · lever/${board.site}: FAILED — ${message}`);
      }
      await sleep(requestDelayMs);
      if (limit && all.length >= limit) break;
    }

    return limit ? all.slice(0, limit) : all;
  },
};
