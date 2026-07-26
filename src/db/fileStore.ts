import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Job } from "../types.js";
import {
  getRetentionDays,
  isJobStale,
  retentionCutoffIso,
} from "./retention.js";
import type {
  Application,
  ApplicationStatus,
  DataStore,
  Metrics,
  StoredJob,
  UserProfile,
} from "./types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STORE_DIR = path.join(ROOT, "data", "store");
const FILE = path.join(STORE_DIR, "app-db.json");

interface FileDb {
  jobs: Record<string, StoredJob>;
  applications: Record<string, Application>;
  profile: UserProfile;
  meta: Record<string, unknown>;
}

const DEFAULT_RESUME = `YOUR NAME
Data Engineer | email@example.com | City, Country

SUMMARY
Data engineer with experience building reliable data pipelines, warehouses, and analytics platforms.

SKILLS
Python, SQL, Spark, Airflow, dbt, Kafka, AWS/GCP, Snowflake/BigQuery, Docker, Git

EXPERIENCE
Data Engineer — Company (20XX–Present)
- Designed and maintained ETL/ELT pipelines processing large datasets
- Built dimensional models and data quality checks for analytics consumers
- Partnered with stakeholders to deliver trusted datasets for product and finance

PROJECTS
- Streaming pipeline with Kafka + Spark for near-real-time analytics
- dbt project with tests and documentation for warehouse models

EDUCATION
B.S. / M.S. — University
`;

function emptyDb(): FileDb {
  return {
    jobs: {},
    applications: {},
    profile: {
      id: "default",
      fullName: "",
      email: "",
      phone: "",
      linkedin: "",
      location: "",
      baseResumeText: DEFAULT_RESUME,
      updatedAt: new Date().toISOString(),
    },
    meta: {},
  };
}

export class FileStore implements DataStore {
  private db: FileDb = emptyDb();
  private ready = false;

  async ensureReady(): Promise<void> {
    if (this.ready) return;
    await mkdir(STORE_DIR, { recursive: true });
    try {
      const raw = await readFile(FILE, "utf8");
      this.db = { ...emptyDb(), ...JSON.parse(raw) };
      this.db.jobs ??= {};
      this.db.applications ??= {};
      this.db.meta ??= {};
      this.db.profile ??= emptyDb().profile;
    } catch {
      this.db = emptyDb();
      await this.persist();
    }
    this.ready = true;
  }

  private async persist(): Promise<void> {
    await mkdir(STORE_DIR, { recursive: true });
    await writeFile(FILE, JSON.stringify(this.db, null, 2), "utf8");
  }

  async upsertJobs(
    jobs: Job[],
    opts: { markDe?: boolean } = {},
  ): Promise<{ upserted: number }> {
    await this.ensureReady();
    const now = new Date().toISOString();
    let upserted = 0;
    for (const job of jobs) {
      const prev = this.db.jobs[job.id];
      this.db.jobs[job.id] = {
        ...job,
        isDataEngineer: opts.markDe ?? prev?.isDataEngineer ?? false,
        active: true,
        firstSeenAt: prev?.firstSeenAt ?? now,
        lastSeenAt: now,
      };
      upserted += 1;
    }
    await this.persist();
    return { upserted };
  }

  async listJobs(query: {
    q?: string;
    company?: string;
    source?: string;
    remote?: boolean;
    deOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: StoredJob[]; total: number }> {
    await this.ensureReady();
    let jobs = Object.values(this.db.jobs).filter((j) => j.active !== false);
    if (query.deOnly) jobs = jobs.filter((j) => j.isDataEngineer);
    if (query.company) {
      const c = query.company.toLowerCase();
      jobs = jobs.filter((j) => j.company.toLowerCase().includes(c));
    }
    if (query.source) {
      jobs = jobs.filter((j) => j.source === query.source);
    }
    if (query.remote === true) jobs = jobs.filter((j) => j.remote);
    if (query.remote === false) jobs = jobs.filter((j) => !j.remote);
    if (query.q) {
      const q = query.q.toLowerCase();
      jobs = jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.company.toLowerCase().includes(q) ||
          j.location.toLowerCase().includes(q) ||
          j.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    jobs.sort((a, b) => {
      const ta = a.postedAt ? Date.parse(a.postedAt) : 0;
      const tb = b.postedAt ? Date.parse(b.postedAt) : 0;
      return tb - ta || b.lastSeenAt.localeCompare(a.lastSeenAt);
    });
    const total = jobs.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    return { jobs: jobs.slice(offset, offset + limit), total };
  }

  async getJob(id: string): Promise<StoredJob | null> {
    await this.ensureReady();
    return this.db.jobs[id] ?? null;
  }

  async listApplications(): Promise<Application[]> {
    await this.ensureReady();
    return Object.values(this.db.applications).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  async getApplication(id: string): Promise<Application | null> {
    await this.ensureReady();
    return this.db.applications[id] ?? null;
  }

  async getApplicationByJobId(jobId: string): Promise<Application | null> {
    await this.ensureReady();
    return (
      Object.values(this.db.applications).find((a) => a.jobId === jobId) ?? null
    );
  }

  async upsertApplication(
    input: Partial<Application> & { jobId: string; status: ApplicationStatus },
  ): Promise<Application> {
    await this.ensureReady();
    const job = this.db.jobs[input.jobId];
    if (!job) throw new Error(`Job not found: ${input.jobId}`);

    const existing =
      (input.id && this.db.applications[input.id]) ||
      (await this.getApplicationByJobId(input.jobId));

    const now = new Date().toISOString();
    const status = input.status;
    const appliedAt =
      status === "applied" ||
      status === "interview" ||
      status === "offer" ||
      status === "rejected"
        ? input.appliedAt ?? existing?.appliedAt ?? now
        : input.appliedAt ?? existing?.appliedAt ?? null;

    const app: Application = {
      id: existing?.id ?? input.id ?? randomUUID(),
      jobId: input.jobId,
      status,
      notes: input.notes ?? existing?.notes ?? "",
      tailoredResumeText:
        input.tailoredResumeText ?? existing?.tailoredResumeText,
      appliedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      company: job.company,
      title: job.title,
      source: job.source,
      url: job.url,
      location: job.location,
    };

    this.db.applications[app.id] = app;
    await this.persist();
    return app;
  }

  async deleteApplication(id: string): Promise<boolean> {
    await this.ensureReady();
    if (!this.db.applications[id]) return false;
    delete this.db.applications[id];
    await this.persist();
    return true;
  }

  async getProfile(): Promise<UserProfile> {
    await this.ensureReady();
    return this.db.profile;
  }

  async saveProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
    await this.ensureReady();
    this.db.profile = {
      ...this.db.profile,
      ...patch,
      id: "default",
      updatedAt: new Date().toISOString(),
    };
    await this.persist();
    return this.db.profile;
  }

  async getMetrics(): Promise<Metrics> {
    await this.ensureReady();
    const jobs = Object.values(this.db.jobs);
    const apps = Object.values(this.db.applications);
    const statuses: ApplicationStatus[] = [
      "saved",
      "resume_ready",
      "applied",
      "interview",
      "rejected",
      "offer",
      "withdrawn",
    ];
    const byStatus = Object.fromEntries(
      statuses.map((s) => [s, 0]),
    ) as Record<ApplicationStatus, number>;
    for (const a of apps) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;

    const companyMap = new Map<string, number>();
    const sourceMap = new Map<string, number>();
    for (const a of apps) {
      if (a.status === "saved") continue;
      companyMap.set(a.company, (companyMap.get(a.company) ?? 0) + 1);
      sourceMap.set(a.source, (sourceMap.get(a.source) ?? 0) + 1);
    }

    const weekMap = new Map<string, number>();
    for (const a of apps) {
      if (!a.appliedAt) continue;
      const d = new Date(a.appliedAt);
      const week = getWeekKey(d);
      weekMap.set(week, (weekMap.get(week) ?? 0) + 1);
    }

    return {
      totalJobs: jobs.length,
      deJobs: jobs.filter((j) => j.isDataEngineer).length,
      applicationsTotal: apps.length,
      byStatus,
      byCompany: [...companyMap.entries()]
        .map(([company, count]) => ({ company, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      bySource: [...sourceMap.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
      byWeek: [...weekMap.entries()]
        .map(([week, applied]) => ({ week, applied }))
        .sort((a, b) => a.week.localeCompare(b.week))
        .slice(-12),
      recentApplications: apps
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 10),
      lastJobSyncAt: (this.db.meta.lastJobSyncAt as string) ?? null,
    };
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.ensureReady();
    this.db.meta[key] = value;
    await this.persist();
  }

  async getMeta<T>(key: string): Promise<T | null> {
    await this.ensureReady();
    return (this.db.meta[key] as T) ?? null;
  }

  async pruneStaleJobs(
    days = getRetentionDays(),
  ): Promise<{ removed: number; cutoffIso: string; days: number }> {
    await this.ensureReady();
    const cutoffIso = retentionCutoffIso(days);
    let removed = 0;
    for (const [id, job] of Object.entries(this.db.jobs)) {
      if (isJobStale(job, cutoffIso)) {
        delete this.db.jobs[id];
        removed += 1;
      }
    }
    this.db.meta.lastPruneAt = new Date().toISOString();
    this.db.meta.lastPrune = { removed, cutoffIso, days };
    await this.persist();
    return { removed, cutoffIso, days };
  }

  async close(): Promise<void> {
    /* no-op */
  }
}

function getWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
