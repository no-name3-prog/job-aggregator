import type { Job } from "../types.js";

export type ApplicationStatus =
  | "saved"
  | "resume_ready"
  | "applied"
  | "interview"
  | "rejected"
  | "offer"
  | "withdrawn";

export interface StoredJob extends Job {
  isDataEngineer: boolean;
  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
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
  /** Denormalized for easy metrics */
  company: string;
  title: string;
  source: string;
  url: string;
  location: string;
}

export interface UserProfile {
  id: "default";
  fullName: string;
  email: string;
  phone: string;
  linkedin?: string;
  location?: string;
  baseResumeText: string;
  updatedAt: string;
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

export interface DataStore {
  ensureReady(): Promise<void>;
  upsertJobs(jobs: Job[], opts?: { markDe?: boolean }): Promise<{ upserted: number }>;
  listJobs(query: {
    q?: string;
    company?: string;
    source?: string;
    remote?: boolean;
    deOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: StoredJob[]; total: number }>;
  getJob(id: string): Promise<StoredJob | null>;
  listApplications(): Promise<Application[]>;
  getApplication(id: string): Promise<Application | null>;
  getApplicationByJobId(jobId: string): Promise<Application | null>;
  upsertApplication(
    input: Partial<Application> & { jobId: string; status: ApplicationStatus },
  ): Promise<Application>;
  deleteApplication(id: string): Promise<boolean>;
  getProfile(): Promise<UserProfile>;
  saveProfile(patch: Partial<UserProfile>): Promise<UserProfile>;
  getMetrics(): Promise<Metrics>;
  setMeta(key: string, value: unknown): Promise<void>;
  getMeta<T>(key: string): Promise<T | null>;
  /** Remove jobs older than `days` (default from JOB_RETENTION_DAYS / 15). */
  pruneStaleJobs(days?: number): Promise<{ removed: number; cutoffIso: string; days: number }>;
  close(): Promise<void>;
}
