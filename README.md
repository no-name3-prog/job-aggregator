# DE Apply Tracker (Job Aggregator MVP)

Free-stack **Data Engineer job radar + application CRM + resume draft helper**.  
**Manual apply only** — auto-apply is intentionally not implemented.

## Features

| Feature | Status |
|---------|--------|
| Fetch jobs from free APIs + official ATS (Greenhouse, Workday, Lever, Ashby) | Yes |
| DE role filter | Yes (`npm run ingest:de`) |
| Dashboard metrics (where / when / status) | Yes |
| Browse DE jobs, open official apply URL | Yes |
| Mark applied / interview / offer / rejected | Yes |
| Base resume + JD keyword tailor (draft) | Yes |
| Auto-submit applications | **No** (later, if ever) |
| MongoDB Atlas free **or** local JSON store | Yes |

## Quick start

```bash
# 1) Install
npm install
npm run setup:web

# 2) Pull DE jobs + sync into store
npm run pipeline:de
#    = ingest:de && sync:jobs

# 3) API (port 8787)
npm run api

# 4) Dashboard (port 5173) — new terminal
npm run dev:web
```

Open **http://localhost:5173**

### Optional: MongoDB Atlas (free)

Copy `.env.example` → `.env`:

```env
MONGODB_URI=mongodb+srv://USER:PASS@cluster.../job_aggregator
MONGODB_DB=job_aggregator
PORT=8787
CORS_ORIGIN=http://localhost:5173
```

If `MONGODB_URI` is empty, data lives in `data/store/app-db.json` (fully offline/free).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run ingest` | All general sources → `data/jobs.json` |
| `npm run ingest:de` | DE discovery → `data/data-engineer/` |
| `npm run sync:jobs` | JSON → DB/store |
| `npm run pipeline:de` | DE ingest + sync |
| `npm run api` | Express API |
| `npm run dev:web` | Vite React UI |
| `npm run build:web` | Production UI → `web/dist` (served by API) |

## Dashboard pages

1. **Dashboard** — DE job count, applications by status/company, recent activity  
2. **DE Jobs** — search/filter, open detail  
3. **Job detail** — description, **Open official apply**, generate resume draft, save status/notes  
4. **Applications** — table of tracked apps, update status  
5. **Resume** — edit base resume/profile used for tailoring  

## API (local)

- `GET /api/jobs?deOnly=true&q=&company=&source=&remote=`  
- `GET /api/jobs/:id`  
- `GET/POST /api/applications`  
- `PATCH/DELETE /api/applications/:id`  
- `GET /api/metrics`  
- `GET/PUT /api/profile`  
- `POST /api/resume/tailor` `{ "jobId": "..." }`  

## Architecture

```
GitHub Actions (later) or local cron
        │
        ▼
  ingest:de → data/data-engineer/jobs.json
        │
        ▼
  sync:jobs → Mongo free OR data/store/app-db.json
        │
        ▼
  Express API (:8787) ←→ React dashboard (:5173)
```

## Manual apply workflow

1. Run `pipeline:de` to refresh DE roles  
2. In UI, open a job  
3. Paste/edit **base resume** under Resume  
4. **Generate tailored draft** (keyword-based, free — no paid LLM)  
5. Click **Open official apply** (or **Apply & mark applied**)  
6. Submit on the company site yourself  
7. Track status → interview / rejected / offer  

## Config

- ATS boards: `config/ats-boards.json`  
- Sources: `src/sources/*`  
- DE title matcher: `src/matching/dataEngineer.ts`  

## Notes

- Eightfold public API remains blocked (403).  
- Resume tailor does **not** invent experience — review drafts.  
- Single-user local app (no auth). Don’t expose API publicly without auth.  

## Docker

Single image runs **API + built dashboard**. Optional Mongo and worker for DE ingest.

### Build & run (file store, free)

```bash
docker compose up --build -d
# open http://localhost:8787
```

Data persists in the `app-data` volume (`/app/data` inside the container).

### Commands

| Command | What it does |
|---------|----------------|
| `npm run docker:build` | Build `job-aggregator:app` |
| `npm run docker:up` | Build + start app |
| `npm run docker:down` | Stop stack |
| `npm run docker:logs` | Follow app logs |
| `npm run docker:pipeline` | One-shot DE ingest + sync in container |
| `npm run docker:mongo` | App + local Mongo 7 |

### With local Mongo

```bash
docker compose -f docker-compose.yml -f docker-compose.mongo.yml --profile mongo up --build -d
# app uses mongodb://mongo:27017
```

Or set your free Atlas URI:

```bash
export MONGODB_URI='mongodb+srv://USER:PASS@cluster/...'
docker compose up --build -d
```

### Manual image build

```bash
docker build -t job-aggregator:app .
docker run --rm -p 8787:8787 \
  -v job_agg_data:/app/data \
  -e CORS_ORIGIN='*' \
  job-aggregator:app
```

### DE pipeline in Docker

```bash
# After app image is built:
docker compose run --rm --entrypoint '' worker npm run pipeline:de
# or: npm run docker:pipeline
```

### Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage: web build + Node API runtime |
| `docker-compose.yml` | `app`, optional `worker` / `mongo` profiles |
| `docker-compose.mongo.yml` | Wire app → compose Mongo |
| `.dockerignore` | Keep image small |

Image default: **port 8787**, serves UI from `web/dist` + `/api/*`.

## GitHub Actions (auto refresh)

Workflow: `.github/workflows/ingest-jobs.yml`

| Trigger | When |
|---------|------|
| **schedule** | Every **3 hours** (`0 */3 * * *` UTC) |
| **manual** | Actions → **Ingest jobs** → Run workflow |

### What it does

1. `npm run ingest` — all general sources → `data/jobs.json`  
2. `npm run ingest:de` — DE discovery → `data/data-engineer/*`  
3. If secret **`MONGODB_URI`** is set → `npm run sync:jobs` into Mongo  
4. Commits refreshed **public job JSON** back to the repo (not personal `data/store/`)  
5. Writes `data/ci-status.json` with last run time  

### Setup

1. Push this repo to GitHub (public preferred for free Actions minutes).  
2. Optional Mongo: **Settings → Secrets and variables → Actions**  
   - `MONGODB_URI` = your Atlas connection string  
   - `MONGODB_DB` = `job_aggregator` (optional)  
3. Actions must be allowed to write (default `contents: write` in the workflow).  
4. Run once manually: **Actions → Ingest jobs → Run workflow**.  

### Notes

- Cron is **not exact** (GitHub may delay).  
- Job data in git = free durable JSON store for the dashboard after pull/deploy.  
- Personal applications/resume stay in `data/store/` (gitignored) or Mongo — **not** committed by CI.  
- Local same steps: `npm run ci:ingest`  


## Retention policy (15 days)

Jobs older than **15 days** are removed automatically from:

- MongoDB / local store  
- `data/jobs.json` and `data/data-engineer/*` JSON dumps  

**Age signal:** newest of `postedAt` → `lastSeenAt` → `scrapedAt` → `firstSeenAt`.

| Config | Default |
|--------|---------|
| `JOB_RETENTION_DAYS` | `15` |

Runs on:

- `npm run sync:jobs` (store prune)  
- `npm run prune:jobs` (store + JSON)  
- `npm run pipeline:de`  
- GitHub Actions after each ingest  

Applications you tracked are **kept** (only job listings are deleted).

```bash
npm run prune:jobs
# or
JOB_RETENTION_DAYS=15 npm run prune:jobs
```
