import type { Job, JobSource } from "../types.js";
import { fetchJson, htmlToText, makeId, nowIso, truncate } from "../utils.js";

interface RemoteOkJob {
  id?: string | number;
  slug?: string;
  company?: string;
  company_logo?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  date?: string;
  url?: string;
  apply_url?: string;
  salary_min?: number;
  salary_max?: number;
  // first array element is a legal notice without id/position
  legal?: string;
}

export const remoteokSource: JobSource = {
  name: "remoteok",
  async fetchJobs({ limit } = {}) {
    const data = await fetchJson<RemoteOkJob[]>("https://remoteok.com/api", {
      headers: {
        // RemoteOK is picky about UA sometimes
        "User-Agent":
          "JobAggregatorMVP/0.1 (github.com/local/job-aggregator; educational)",
      },
    });
    const scrapedAt = nowIso();
    let jobs = (data ?? []).filter((j) => j.id && j.position);
    if (limit) jobs = jobs.slice(0, limit);

    return jobs.map((j): Job => {
      const externalId = String(j.id);
      const url =
        j.url ||
        j.apply_url ||
        (j.slug ? `https://remoteok.com/remote-jobs/${j.slug}` : "https://remoteok.com");
      let salary: string | undefined;
      if (j.salary_min || j.salary_max) {
        salary = `USD ${j.salary_min ?? "?"} – ${j.salary_max ?? "?"}`;
      }
      const location = j.location?.trim() || "Remote";
      return {
        id: makeId("remoteok", externalId),
        externalId,
        source: "remoteok",
        title: j.position?.trim() || "Untitled",
        company: (j.company || "Unknown").replace(/&amp;/g, "&").trim(),
        companyLogo: j.company_logo || undefined,
        location,
        remote: true,
        url,
        description: truncate(htmlToText(j.description)),
        tags: j.tags ?? [],
        salary,
        postedAt: j.date ? new Date(j.date).toISOString() : null,
        scrapedAt,
      };
    });
  },
};
