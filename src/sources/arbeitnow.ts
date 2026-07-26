import type { Job, JobSource } from "../types.js";
import { fetchJson, htmlToText, makeId, nowIso, truncate } from "../utils.js";

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description?: string;
  remote: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at: number;
}

interface ArbeitnowResponse {
  data: ArbeitnowJob[];
}

export const arbeitnowSource: JobSource = {
  name: "arbeitnow",
  async fetchJobs({ limit } = {}) {
    const data = await fetchJson<ArbeitnowResponse>(
      "https://www.arbeitnow.com/api/job-board-api",
    );
    const scrapedAt = nowIso();
    let jobs = data.data ?? [];
    if (limit) jobs = jobs.slice(0, limit);

    return jobs.map((j): Job => ({
      id: makeId("arbeitnow", j.slug),
      externalId: j.slug,
      source: "arbeitnow",
      title: j.title?.trim() || "Untitled",
      company: j.company_name?.trim() || "Unknown",
      location: j.location?.trim() || (j.remote ? "Remote" : "Unknown"),
      remote: Boolean(j.remote),
      url: j.url,
      description: truncate(htmlToText(j.description)),
      tags: [...(j.tags ?? []), ...(j.job_types ?? [])].filter(Boolean),
      jobType: j.job_types?.[0],
      postedAt: j.created_at
        ? new Date(j.created_at * 1000).toISOString()
        : null,
      scrapedAt,
    }));
  },
};
