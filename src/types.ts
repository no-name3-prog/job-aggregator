/** Normalized job shape used across all sources (pre-DB). */
export interface Job {
  id: string;
  externalId: string;
  source: string;
  title: string;
  company: string;
  companyLogo?: string;
  location: string;
  remote: boolean;
  url: string;
  description: string;
  tags: string[];
  jobType?: string;
  salary?: string;
  postedAt: string | null;
  scrapedAt: string;
}

export interface FetchJobsOptions {
  /** Cap total jobs returned by this source (after fetch/filter). */
  limit?: number;
  /** Server-side search text where supported (Workday CXS). */
  searchText?: string;
  /** Greenhouse: include HTML job content (slower / larger). Default true. */
  includeContent?: boolean;
  /** Override max jobs pulled per company board. */
  maxPerBoard?: number;
}

export interface SourceResult {
  source: string;
  jobs: Job[];
  fetched: number;
  error?: string;
}

export interface IngestMeta {
  lastRunAt: string;
  durationMs: number;
  totalJobs: number;
  sources: Array<{
    source: string;
    fetched: number;
    kept: number;
    error?: string;
  }>;
}

export interface JobSource {
  name: string;
  fetchJobs(options?: FetchJobsOptions): Promise<Job[]>;
}

export interface CompanySummary {
  company: string;
  jobCount: number;
  sources: string[];
  locations: string[];
  sampleTitles: string[];
  officialUrls: string[];
}
