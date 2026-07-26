import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  type Application,
  type ApplicationStatus,
  type Job,
} from "../api/client";

const STATUSES: ApplicationStatus[] = [
  "saved",
  "resume_ready",
  "applied",
  "interview",
  "rejected",
  "offer",
  "withdrawn",
];

export default function JobDetailPage() {
  const { id = "" } = useParams();
  const jobId = decodeURIComponent(id);
  const [job, setJob] = useState<Job | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [status, setStatus] = useState<ApplicationStatus>("saved");
  const [notes, setNotes] = useState("");
  const [tailored, setTailored] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getJob(jobId)
      .then((r) => {
        setJob(r.job);
        setApplication(r.application);
        if (r.application) {
          setStatus(r.application.status);
          setNotes(r.application.notes || "");
          setTailored(r.application.tailoredResumeText || "");
        }
      })
      .catch((e) => setErr(e.message));
  }, [jobId]);

  async function save(nextStatus?: ApplicationStatus) {
    if (!job) return;
    setBusy(true);
    setMsg("");
    try {
      const s = nextStatus ?? status;
      const { application: app } = await api.upsertApplication({
        jobId: job.id,
        status: s,
        notes,
        tailoredResumeText: tailored || undefined,
      });
      setApplication(app);
      setStatus(app.status);
      setMsg(`Saved as “${app.status}”`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function generateResume() {
    if (!job) return;
    setBusy(true);
    setErr("");
    try {
      const r = await api.tailorResume(job.id);
      setTailored(r.tailoredText);
      setKeywords(r.matchedKeywords);
      setNote(r.note);
      setStatus("resume_ready");
      setMsg("Resume draft generated — review before applying");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function markAppliedAndOpen() {
    if (!job) return;
    await save("applied");
    window.open(job.url, "_blank", "noopener,noreferrer");
  }

  if (err && !job) return <div className="error">{err}</div>;
  if (!job) return <div className="muted">Loading job…</div>;

  return (
    <div>
      <p>
        <Link to="/jobs">← Back to jobs</Link>
      </p>
      <div className="page-header">
        <div>
          <h1>{job.title}</h1>
          <p>
            {job.company} · {job.location} ·{" "}
            <span className="badge badge-source">{job.source}</span>
            {job.remote && (
              <>
                {" "}
                <span className="badge badge-remote">Remote</span>
              </>
            )}
          </p>
        </div>
        <div className="row-actions">
          <a
            className="btn btn-primary"
            href={job.url}
            target="_blank"
            rel="noreferrer"
          >
            Open official apply
          </a>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={markAppliedAndOpen}
          >
            Apply & mark applied
          </button>
        </div>
      </div>

      {msg && <div className="alert">{msg}</div>}
      {err && <div className="error">{err}</div>}

      <div className="detail-layout">
        <div className="stack">
          <div className="card">
            <h3>Job description</h3>
            <div className="desc" style={{ marginTop: "0.75rem" }}>
              {job.description || "No description from source (open official URL)."}
            </div>
            {job.tags.length > 0 && (
              <div className="tags">
                {job.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Track application</h3>
            <p className="muted" style={{ fontSize: "0.9rem" }}>
              Status:{" "}
              {application ? (
                <span className="badge badge-status">{application.status}</span>
              ) : (
                "not tracked yet"
              )}
            </p>
            <div className="stack" style={{ marginTop: "0.75rem" }}>
              <label className="muted">
                Status
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as ApplicationStatus)
                  }
                  style={{ display: "block", width: "100%", marginTop: 4 }}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted">
                Notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ minHeight: 80, marginTop: 4 }}
                  placeholder="Referral, deadline, follow-up…"
                />
              </label>
              <div className="row-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy}
                  onClick={() => save()}
                >
                  Save tracking
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => save("applied")}
                >
                  Mark applied
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <h3>Resume draft for this JD</h3>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Free keyword tailor — edit so everything is true. No auto-submit.
            </p>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={generateResume}
              style={{ marginTop: "0.5rem" }}
            >
              Generate tailored draft
            </button>
            {note && (
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                {note}
              </p>
            )}
            {keywords.length > 0 && (
              <div className="keywords">
                {keywords.map((k) => (
                  <span key={k} className="kw">
                    {k}
                  </span>
                ))}
              </div>
            )}
            <textarea
              value={tailored}
              onChange={(e) => setTailored(e.target.value)}
              placeholder="Generate a draft or paste your tailored resume text…"
              style={{ marginTop: "0.5rem", minHeight: 280 }}
            />
            <button
              className="btn"
              type="button"
              disabled={busy || !tailored}
              onClick={() => save("resume_ready")}
            >
              Save resume draft with job
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
