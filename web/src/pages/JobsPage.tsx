import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Job } from "../api/client";

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [company, setCompany] = useState("");
  const [source, setSource] = useState("");
  const [remote, setRemote] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api
      .listJobs({
        q: q || undefined,
        company: company || undefined,
        source: source || undefined,
        remote: remote === "" ? undefined : remote === "true",
        deOnly: true,
        limit: 100,
      })
      .then((r) => {
        setJobs(r.jobs);
        setTotal(r.total);
        setErr("");
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Data Engineer jobs</h1>
          <p>
            {total} roles in store · open a job to tailor resume & mark applied
          </p>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Search title, company, location…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <input
          placeholder="Company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {[
            "greenhouse",
            "workday",
            "lever",
            "ashby",
            "remotive",
            "arbeitnow",
            "jobicy",
            "remoteok",
          ].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={remote} onChange={(e) => setRemote(e.target.value)}>
          <option value="">Remote any</option>
          <option value="true">Remote only</option>
          <option value="false">Not remote</option>
        </select>
        <button className="btn btn-primary" type="button" onClick={load}>
          Filter
        </button>
      </div>

      {err && <div className="error">{err}</div>}
      {loading && <div className="muted">Loading…</div>}
      {!loading && jobs.length === 0 && (
        <div className="empty">
          No DE jobs yet. Run <code className="mono">npm run pipeline:de</code>{" "}
          then refresh.
        </div>
      )}

      <div className="grid-cards">
        {jobs.map((job) => (
          <Link
            key={job.id}
            to={`/jobs/${encodeURIComponent(job.id)}`}
            className="card"
            style={{ color: "inherit", textDecoration: "none" }}
          >
            <h3>{job.title}</h3>
            <div className="meta">
              <span>{job.company}</span>
              <span>{job.location}</span>
              {job.remote && <span className="badge badge-remote">Remote</span>}
              <span className="badge badge-source">{job.source}</span>
            </div>
            <div className="tags">
              {job.tags.slice(0, 4).map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
