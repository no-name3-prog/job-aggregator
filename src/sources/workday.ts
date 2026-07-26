import { loadAtsConfig } from "../config/loadAtsConfig.js";
import type { FetchJobsOptions, Job, JobSource } from "../types.js";
import { fetchJson, makeId, nowIso, sleep } from "../utils.js";

interface WdPosting {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  remoteType?: string;
  bulletFields?: string[];
}

interface WdListResponse {
  total?: number;
  jobPostings?: WdPosting[];
}

function isRemote(location: string, remoteType?: string): boolean {
  const blob = `${location} ${remoteType ?? ""}`;
  return /remote|work from home|wfh|distributed/i.test(blob);
}

function parsePostedOn(postedOn?: string): string | null {
  if (!postedOn) return null;
  const isoTry = Date.parse(postedOn);
  if (!Number.isNaN(isoTry)) return new Date(isoTry).toISOString();
  return null;
}

export const workdaySource: JobSource = {
  name: "workday",
  async fetchJobs(options: FetchJobsOptions = {}) {
    const { limit, searchText = "", maxPerBoard } = options;
    const config = await loadAtsConfig();
    const { maxJobsPerBoard, workdayPageSize, requestDelayMs } = config.options;
    const scrapedAt = nowIso();
    const all: Job[] = [];

    for (const board of config.workday) {
      const listUrl = `https://${board.host}/wday/cxs/${board.tenant}/${board.site}/jobs`;
      const boardJobs: Job[] = [];
      const perBoardCap = maxPerBoard ?? maxJobsPerBoard;
      const effectiveCap = limit
        ? Math.min(limit, perBoardCap)
        : perBoardCap;
      let offset = 0;
      let reportedTotal: number | null = null;

      try {
        while (boardJobs.length < effectiveCap) {
          if (reportedTotal !== null && offset >= reportedTotal) break;

          const pageSize = Math.min(
            workdayPageSize,
            effectiveCap - boardJobs.length,
          );
          const data = await fetchJson<WdListResponse>(listUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              appliedFacets: {},
              limit: pageSize,
              offset,
              searchText,
            }),
          });

          if (
            reportedTotal === null &&
            typeof data.total === "number" &&
            data.total > 0
          ) {
            reportedTotal = data.total;
          }

          const postings = data.jobPostings ?? [];
          if (!postings.length) break;

          for (const p of postings) {
            if (!p.externalPath || !p.title) continue;
            const location = p.locationsText?.trim() || "Unknown";
            const reqId = p.bulletFields?.[0] ?? p.externalPath;
            const applyUrl = `https://${board.host}/${board.site}${p.externalPath}`;

            boardJobs.push({
              id: makeId("workday", `${board.tenant}-${reqId}`),
              externalId: `${board.tenant}:${reqId}`,
              source: "workday",
              title: p.title.trim(),
              company: board.company,
              location,
              remote: isRemote(location, p.remoteType),
              url: applyUrl,
              description: "",
              tags: p.remoteType ? [p.remoteType] : [],
              postedAt: parsePostedOn(p.postedOn),
              scrapedAt,
            });
          }

          offset += postings.length;
          await sleep(requestDelayMs);
          if (postings.length < pageSize) break;
        }

        all.push(...boardJobs);
        console.log(
          `    · workday/${board.company}${searchText ? ` "${searchText}"` : ""}: ${
            boardJobs.length
          } jobs (board total ~${reportedTotal ?? "?"})`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`    · workday/${board.company}: FAILED — ${message}`);
      }

      if (limit && all.length >= limit) break;
    }

    return limit ? all.slice(0, limit) : all;
  },
};
