import { randomUUID } from "node:crypto";
import { MongoClient, type Db, type Collection } from "mongodb";
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
import { FileStore } from "./fileStore.js";

/** Mongo-backed store; reuses FileStore logic for metrics shape via composition helpers. */
export class MongoStore implements DataStore {
  private client: MongoClient;
  private db!: Db;
  private jobs!: Collection<StoredJob>;
  private applications!: Collection<Application>;
  private profile!: Collection<UserProfile>;
  private meta!: Collection<{ _id: string; value: unknown }>;

  constructor(
    uri: string,
    private dbName: string,
  ) {
    this.client = new MongoClient(uri);
  }

  async ensureReady(): Promise<void> {
    if (this.db) return;
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    this.jobs = this.db.collection<StoredJob>("jobs");
    this.applications = this.db.collection<Application>("applications");
    this.profile = this.db.collection<UserProfile>("profile");
    this.meta = this.db.collection("meta");

    await this.jobs.createIndex({ id: 1 }, { unique: true });
    await this.jobs.createIndex({ isDataEngineer: 1, lastSeenAt: -1 });
    await this.jobs.createIndex({ company: 1 });
    await this.jobs.createIndex({ source: 1 });
    await this.applications.createIndex({ id: 1 }, { unique: true });
    await this.applications.createIndex({ jobId: 1 }, { unique: true });
    await this.applications.createIndex({ status: 1 });
  }

  async upsertJobs(
    jobs: Job[],
    opts: { markDe?: boolean } = {},
  ): Promise<{ upserted: number }> {
    await this.ensureReady();
    const now = new Date().toISOString();
    let upserted = 0;
    for (const job of jobs) {
      const existing = await this.jobs.findOne({ id: job.id });
      await this.jobs.updateOne(
        { id: job.id },
        {
          $set: {
            ...job,
            isDataEngineer: opts.markDe ?? existing?.isDataEngineer ?? false,
            active: true,
            lastSeenAt: now,
          },
          $setOnInsert: {
            firstSeenAt: now,
          },
        },
        { upsert: true },
      );
      upserted += 1;
    }
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
    const filter: Record<string, unknown> = { active: { $ne: false } };
    if (query.deOnly) filter.isDataEngineer = true;
    if (query.company) filter.company = { $regex: query.company, $options: "i" };
    if (query.source) filter.source = query.source;
    if (query.remote === true) filter.remote = true;
    if (query.remote === false) filter.remote = false;
    if (query.q) {
      filter.$or = [
        { title: { $regex: query.q, $options: "i" } },
        { company: { $regex: query.q, $options: "i" } },
        { location: { $regex: query.q, $options: "i" } },
        { tags: { $regex: query.q, $options: "i" } },
      ];
    }
    const total = await this.jobs.countDocuments(filter);
    const jobs = await this.jobs
      .find(filter)
      .sort({ postedAt: -1, lastSeenAt: -1 })
      .skip(query.offset ?? 0)
      .limit(query.limit ?? 50)
      .toArray();
    return { jobs, total };
  }

  async getJob(id: string): Promise<StoredJob | null> {
    await this.ensureReady();
    return this.jobs.findOne({ id });
  }

  async listApplications(): Promise<Application[]> {
    await this.ensureReady();
    return this.applications.find({}).sort({ updatedAt: -1 }).toArray();
  }

  async getApplication(id: string): Promise<Application | null> {
    await this.ensureReady();
    return this.applications.findOne({ id });
  }

  async getApplicationByJobId(jobId: string): Promise<Application | null> {
    await this.ensureReady();
    return this.applications.findOne({ jobId });
  }

  async upsertApplication(
    input: Partial<Application> & { jobId: string; status: ApplicationStatus },
  ): Promise<Application> {
    await this.ensureReady();
    const job = await this.getJob(input.jobId);
    if (!job) throw new Error(`Job not found: ${input.jobId}`);

    const existing =
      (input.id ? await this.getApplication(input.id) : null) ||
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

    await this.applications.updateOne(
      { id: app.id },
      { $set: app },
      { upsert: true },
    );
    return app;
  }

  async deleteApplication(id: string): Promise<boolean> {
    await this.ensureReady();
    const res = await this.applications.deleteOne({ id });
    return res.deletedCount > 0;
  }

  async getProfile(): Promise<UserProfile> {
    await this.ensureReady();
    const existing = await this.profile.findOne({ id: "default" });
    if (existing) return existing;
    // Seed from file defaults
    const fs = new FileStore();
    const profile = await fs.getProfile();
    await this.profile.updateOne(
      { id: "default" },
      { $set: profile },
      { upsert: true },
    );
    return profile;
  }

  async saveProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
    await this.ensureReady();
    const current = await this.getProfile();
    const next: UserProfile = {
      ...current,
      ...patch,
      id: "default",
      updatedAt: new Date().toISOString(),
    };
    await this.profile.updateOne(
      { id: "default" },
      { $set: next },
      { upsert: true },
    );
    return next;
  }

  async getMetrics(): Promise<Metrics> {
    await this.ensureReady();
    const jobs = await this.jobs.find({}).toArray();
    const apps = await this.applications.find({}).toArray();
    return computeMetrics(
      jobs,
      apps,
      await this.getMeta<string>("lastJobSyncAt"),
    );
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.ensureReady();
    await this.meta.updateOne(
      { _id: key },
      { $set: { value } },
      { upsert: true },
    );
  }

  async getMeta<T>(key: string): Promise<T | null> {
    await this.ensureReady();
    const doc = await this.meta.findOne({ _id: key });
    return (doc?.value as T) ?? null;
  }

  async pruneStaleJobs(
    days = getRetentionDays(),
  ): Promise<{ removed: number; cutoffIso: string; days: number }> {
    await this.ensureReady();
    const cutoffIso = retentionCutoffIso(days);
    // Free-tier friendly: scan ids client-side (job volume is thousands, not millions)
    const cursor = this.jobs.find(
      {},
      {
        projection: {
          id: 1,
          postedAt: 1,
          lastSeenAt: 1,
          scrapedAt: 1,
          firstSeenAt: 1,
        },
      },
    );
    const staleIds: string[] = [];
    for await (const job of cursor) {
      if (isJobStale(job, cutoffIso) && job.id) staleIds.push(job.id);
    }

    let removed = 0;
    const chunk = 500;
    for (let i = 0; i < staleIds.length; i += chunk) {
      const slice = staleIds.slice(i, i + chunk);
      const res = await this.jobs.deleteMany({ id: { $in: slice } });
      removed += res.deletedCount ?? 0;
    }

    await this.setMeta("lastPruneAt", new Date().toISOString());
    await this.setMeta("lastPrune", { removed, cutoffIso, days });
    return { removed, cutoffIso, days };
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

function computeMetrics(
  jobs: StoredJob[],
  apps: Application[],
  lastJobSyncAt: string | null,
): Metrics {
  const statuses: ApplicationStatus[] = [
    "saved",
    "resume_ready",
    "applied",
    "interview",
    "rejected",
    "offer",
    "withdrawn",
  ];
  const byStatus = Object.fromEntries(statuses.map((s) => [s, 0])) as Record<
    ApplicationStatus,
    number
  >;
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
    const week = `${d.getUTCFullYear()}-W${String(
      Math.ceil(
        ((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
          Date.UTC(d.getUTCFullYear(), 0, 1)) /
          86400000 +
          1) /
          7,
      ),
    ).padStart(2, "0")}`;
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
    recentApplications: [...apps]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 10),
    lastJobSyncAt,
  };
}
