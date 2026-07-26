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

interface GhLocation {
  name?: string;
}

interface GhDepartment {
  name?: string;
}

interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  company_name?: string;
  location?: GhLocation;
  updated_at?: string;
  first_published?: string;
  content?: string;
  departments?: GhDepartment[];
  offices?: GhLocation[];
}

interface GhResponse {
  jobs: GhJob[];
}

function isRemote(location: string): boolean {
  return /remote|anywhere|distributed|worldwide/i.test(location);
}

function decodeGhContent(content?: string): string {
  if (!content) return "";
  return content
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function mapJob(j: GhJob, boardToken: string, boardCompany: string, scrapedAt: string): Job {
  const location =
    j.location?.name?.trim() ||
    j.offices?.map((o) => o.name).filter(Boolean).join(", ") ||
    "Unknown";
  const company = j.company_name?.trim() || boardCompany;
  return {
    id: makeId("greenhouse", `${boardToken}-${j.id}`),
    externalId: `${boardToken}:${j.id}`,
    source: "greenhouse",
    title: j.title?.trim() || "Untitled",
    company,
    location,
    remote: isRemote(location),
    url: j.absolute_url,
    description: truncate(htmlToText(decodeGhContent(j.content))),
    tags: (j.departments ?? [])
      .map((d) => d.name)
      .filter((n): n is string => Boolean(n)),
    postedAt: j.first_published
      ? new Date(j.first_published).toISOString()
      : j.updated_at
        ? new Date(j.updated_at).toISOString()
        : null,
    scrapedAt,
  };
}

export const greenhouseSource: JobSource = {
  name: "greenhouse",
  async fetchJobs({ limit, includeContent = true, maxPerBoard } = {}) {
    const config = await loadAtsConfig();
    const { maxJobsPerBoard, requestDelayMs } = config.options;
    const perBoard = maxPerBoard ?? maxJobsPerBoard;
    const scrapedAt = nowIso();
    const all: Job[] = [];

    for (const board of config.greenhouse) {
      const qs = includeContent ? "?content=true" : "";
      const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
        board.token,
      )}/jobs${qs}`;

      try {
        const data = await fetchJson<GhResponse>(url);
        let jobs = data.jobs ?? [];
        // When includeContent is false (list scan), allow full board up to perBoard
        jobs = jobs.slice(0, perBoard);

        for (const j of jobs) {
          all.push(mapJob(j, board.token, board.company, scrapedAt));
        }

        console.log(
          `    · greenhouse/${board.token}: ${jobs.length} jobs (of ${
            data.jobs?.length ?? 0
          })`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`    · greenhouse/${board.token}: FAILED — ${message}`);
      }

      await sleep(requestDelayMs);
      if (limit && all.length >= limit) break;
    }

    return limit ? all.slice(0, limit) : all;
  },
};

/** Fetch full description for a single Greenhouse job (official board API). */
export async function fetchGreenhouseJobDetail(
  boardToken: string,
  jobId: number | string,
  company: string,
): Promise<Job | null> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    boardToken,
  )}/jobs/${jobId}?questions=false`;
  try {
    const j = await fetchJson<GhJob>(url);
    return mapJob(j, boardToken, company, nowIso());
  } catch {
    return null;
  }
}
