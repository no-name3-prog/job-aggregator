import type { Job, JobSource } from "../types.js";
import { fetchJson, htmlToText, makeId, nowIso, truncate } from "../utils.js";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  company_logo?: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

export const remotiveSource: JobSource = {
  name: "remotive",
  async fetchJobs({ limit } = {}) {
    const data = await fetchJson<RemotiveResponse>(
      "https://remotive.com/api/remote-jobs",
    );
    const scrapedAt = nowIso();
    let jobs = data.jobs ?? [];
    if (limit) jobs = jobs.slice(0, limit);

    return jobs.map((j): Job => {
      const location = j.candidate_required_location?.trim() || "Remote";
      return {
        id: makeId("remotive", j.id),
        externalId: String(j.id),
        source: "remotive",
        title: j.title?.trim() || "Untitled",
        company: j.company_name?.trim() || "Unknown",
        companyLogo: j.company_logo,
        location,
        remote: true,
        url: j.url,
        description: truncate(htmlToText(j.description)),
        tags: [
          ...(j.category ? [j.category] : []),
          ...(j.tags ?? []),
        ].filter(Boolean),
        jobType: j.job_type,
        salary: j.salary || undefined,
        postedAt: j.publication_date
          ? new Date(j.publication_date).toISOString()
          : null,
        scrapedAt,
      };
    });
  },
};
