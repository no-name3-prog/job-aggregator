import type { Job, JobSource } from "../types.js";
import { fetchJson, htmlToText, makeId, nowIso, truncate } from "../utils.js";

interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  companyLogo?: string;
  jobIndustry?: string[];
  jobType?: string[];
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  annualSalaryMin?: number;
  annualSalaryMax?: number;
  salaryCurrency?: string;
}

interface JobicyResponse {
  jobs: JobicyJob[];
}

export const jobicySource: JobSource = {
  name: "jobicy",
  async fetchJobs({ limit } = {}) {
    // Jobicy free API caps count; 50 is a reasonable page.
    const count = limit && limit < 50 ? limit : 50;
    const data = await fetchJson<JobicyResponse>(
      `https://jobicy.com/api/v2/remote-jobs?count=${count}`,
    );
    const scrapedAt = nowIso();
    let jobs = data.jobs ?? [];
    if (limit) jobs = jobs.slice(0, limit);

    return jobs.map((j): Job => {
      let salary: string | undefined;
      if (j.annualSalaryMin || j.annualSalaryMax) {
        const cur = j.salaryCurrency || "USD";
        salary = `${cur} ${j.annualSalaryMin ?? "?"} – ${j.annualSalaryMax ?? "?"}`;
      }
      const location = j.jobGeo?.trim() || "Remote";
      return {
        id: makeId("jobicy", j.id),
        externalId: String(j.id),
        source: "jobicy",
        title: j.jobTitle?.trim() || "Untitled",
        company: j.companyName?.trim() || "Unknown",
        companyLogo: j.companyLogo,
        location,
        remote: true,
        url: j.url,
        description: truncate(
          htmlToText(j.jobDescription || j.jobExcerpt || ""),
        ),
        tags: [
          ...(j.jobIndustry ?? []),
          ...(j.jobLevel ? [j.jobLevel] : []),
        ].filter(Boolean),
        jobType: j.jobType?.[0],
        salary,
        postedAt: j.pubDate ? new Date(j.pubDate).toISOString() : null,
        scrapedAt,
      };
    });
  },
};
