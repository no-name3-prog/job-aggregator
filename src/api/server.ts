import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getStore } from "../db/index.js";
import { tailorResume } from "../resume/tailor.js";
import type { ApplicationStatus } from "../db/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PORT = Number(process.env.PORT || 8787);
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

const app = express();
app.use(
  cors({
    origin: CORS_ORIGIN,
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", async (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/api/jobs", async (req, res) => {
  try {
    const store = await getStore();
    const result = await store.listJobs({
      q: str(req.query.q),
      company: str(req.query.company),
      source: str(req.query.source),
      remote:
        req.query.remote === "true"
          ? true
          : req.query.remote === "false"
            ? false
            : undefined,
      deOnly: req.query.deOnly !== "false",
      limit: num(req.query.limit, 50),
      offset: num(req.query.offset, 0),
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: message(e) });
  }
});

app.get("/api/jobs/:id", async (req, res) => {
  try {
    const store = await getStore();
    const job = await store.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    const application = await store.getApplicationByJobId(job.id);
    res.json({ job, application });
  } catch (e) {
    res.status(500).json({ error: message(e) });
  }
});

app.get("/api/applications", async (_req, res) => {
  try {
    const store = await getStore();
    res.json({ applications: await store.listApplications() });
  } catch (e) {
    res.status(500).json({ error: message(e) });
  }
});

app.post("/api/applications", async (req, res) => {
  try {
    const store = await getStore();
    const { jobId, status, notes, tailoredResumeText, appliedAt } = req.body ?? {};
    if (!jobId || !status) {
      return res.status(400).json({ error: "jobId and status are required" });
    }
    const app = await store.upsertApplication({
      jobId,
      status: status as ApplicationStatus,
      notes,
      tailoredResumeText,
      appliedAt: appliedAt ?? null,
    });
    res.json({ application: app });
  } catch (e) {
    res.status(400).json({ error: message(e) });
  }
});

app.patch("/api/applications/:id", async (req, res) => {
  try {
    const store = await getStore();
    const existing = await store.getApplication(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const app = await store.upsertApplication({
      ...existing,
      ...req.body,
      jobId: existing.jobId,
      status: (req.body.status as ApplicationStatus) ?? existing.status,
    });
    res.json({ application: app });
  } catch (e) {
    res.status(400).json({ error: message(e) });
  }
});

app.delete("/api/applications/:id", async (req, res) => {
  try {
    const store = await getStore();
    const ok = await store.deleteApplication(req.params.id);
    res.json({ ok });
  } catch (e) {
    res.status(500).json({ error: message(e) });
  }
});

app.get("/api/metrics", async (_req, res) => {
  try {
    const store = await getStore();
    res.json(await store.getMetrics());
  } catch (e) {
    res.status(500).json({ error: message(e) });
  }
});

app.get("/api/profile", async (_req, res) => {
  try {
    const store = await getStore();
    res.json({ profile: await store.getProfile() });
  } catch (e) {
    res.status(500).json({ error: message(e) });
  }
});

app.put("/api/profile", async (req, res) => {
  try {
    const store = await getStore();
    const profile = await store.saveProfile(req.body ?? {});
    res.json({ profile });
  } catch (e) {
    res.status(500).json({ error: message(e) });
  }
});

app.post("/api/resume/tailor", async (req, res) => {
  try {
    const store = await getStore();
    const { jobId } = req.body ?? {};
    if (!jobId) return res.status(400).json({ error: "jobId required" });
    const job = await store.getJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    const profile = await store.getProfile();
    const result = tailorResume({
      baseResumeText: profile.baseResumeText,
      jobTitle: job.title,
      company: job.company,
      jobDescription: job.description || `${job.title} ${job.tags.join(" ")}`,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: message(e) });
  }
});

// Serve built dashboard if present
const webDist = path.join(ROOT, "web", "dist");
app.use(express.static(webDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) res.status(404).json({ error: "Dashboard not built. Run npm run build:web or use Vite dev server." });
  });
});

app.listen(PORT, () => {
  console.log(`API + dashboard backend on http://localhost:${PORT}`);
  console.log(`CORS origins: ${CORS_ORIGIN.join(", ")}`);
});

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}
function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
