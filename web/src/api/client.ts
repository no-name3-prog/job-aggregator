const BASE = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
}

export type ApplicationStatus =
  | "saved"
  | "resume_ready"
  | "applied"
  | "interview"
  | "rejected"
  | "offer"
  | "withdrawn";

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
  isDataEngineer?: boolean;
}

export interface Application {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  notes: string;
  tailoredResumeText?: string;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  company: string;
  title: string;
  source: string;
  url: string;
  location: string;
}

export interface Metrics {
  totalJobs: number;
  deJobs: number;
  applicationsTotal: number;
  byStatus: Record<ApplicationStatus, number>;
  byCompany: Array<{ company: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  byWeek: Array<{ week: string; applied: number }>;
  recentApplications: Application[];
  lastJobSyncAt: string | null;
}

export interface Profile {
  id: "default";
  fullName: string;
  email: string;
  phone: string;
  linkedin?: string;
  location?: string;
  baseResumeText: string;
  updatedAt: string;
}

export const api = {
  listJobs: (params: Record<string, string | number | boolean | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    }
    return request<{ jobs: Job[]; total: number }>(`/api/jobs?${qs}`);
  },
  getJob: (id: string) =>
    request<{ job: Job; application: Application | null }>(
      `/api/jobs/${encodeURIComponent(id)}`,
    ),
  listApplications: () =>
    request<{ applications: Application[] }>("/api/applications"),
  upsertApplication: (body: {
    jobId: string;
    status: ApplicationStatus;
    notes?: string;
    tailoredResumeText?: string;
    appliedAt?: string | null;
  }) =>
    request<{ application: Application }>("/api/applications", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateApplication: (
    id: string,
    body: Partial<Application> & { status?: ApplicationStatus },
  ) =>
    request<{ application: Application }>(
      `/api/applications/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  deleteApplication: (id: string) =>
    request<{ ok: boolean }>(`/api/applications/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  metrics: () => request<Metrics>("/api/metrics"),
  getProfile: () => request<{ profile: Profile }>("/api/profile"),
  saveProfile: (body: Partial<Profile>) =>
    request<{ profile: Profile }>("/api/profile", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  tailorResume: (jobId: string) =>
    request<{
      tailoredText: string;
      matchedKeywords: string[];
      suggestedBullets: string[];
      note: string;
    }>("/api/resume/tailor", {
      method: "POST",
      body: JSON.stringify({ jobId }),
    }),
};
