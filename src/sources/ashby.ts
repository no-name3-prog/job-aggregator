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

interface AshbyJob {
  id: string;
  title: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  isRemote?: boolean;
  workplaceType?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  publishedAt?: string;
}

interface AshbyResponse {
  jobs: AshbyJob[];
}

export const ashbySource: JobSource = {
  name: "ashby",
  async fetchJobs({ limit, maxPerBoard } = {}) {
    const config = await loadAtsConfig();
    const { maxJobsPerBoard, requestDelayMs } = config.options;
    const perBoard = maxPerBoard ?? maxJobsPerBoard;
    const scrapedAt = nowIso();
    const all: Job[] = [];

    for (const board of config.ashby) {
      const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
        board.board,
      )}`;
      try {
        const data = await fetchJson<AshbyResponse>(url);
        let jobs = data.jobs ?? [];
        jobs = jobs.slice(0, perBoard);

        for (const j of jobs) {
          const location = j.location?.trim() || "Unknown";
          all.push({
            id: makeId("ashby", `${board.board}-${j.id}`),
            externalId: `${board.board}:${j.id}`,
            source: "ashby",
            title: j.title?.trim() || "Untitled",
            company: board.company,
            location,
            remote: Boolean(j.isRemote) || /remote/i.test(location),
            url: j.jobUrl || j.applyUrl || url,
            description: truncate(
              j.descriptionPlain || htmlToText(j.descriptionHtml) || "",
            ),
            tags: [j.department, j.team, j.workplaceType].filter(
              (t): t is string => Boolean(t),
            ),
            jobType: j.employmentType,
            postedAt: j.publishedAt
              ? new Date(j.publishedAt).toISOString()
              : null,
            scrapedAt,
          });
        }
        console.log(`    · ashby/${board.board}: ${jobs.length} jobs`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`    · ashby/${board.board}: FAILED — ${message}`);
      }
      await sleep(requestDelayMs);
      if (limit && all.length >= limit) break;
    }

    return limit ? all.slice(0, limit) : all;
  },
};
