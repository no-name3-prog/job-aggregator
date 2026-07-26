import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Application, type ApplicationStatus } from "../api/client";

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState("");

  function load() {
    api
      .listApplications()
      .then((r) => setApps(r.applications))
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function updateStatus(id: string, status: ApplicationStatus) {
    await api.updateApplication(id, { status });
    load();
  }

  const filtered = filter
    ? apps.filter((a) => a.status === filter)
    : apps;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Applications</h1>
          <p>Where & when you engaged — update status as you hear back.</p>
        </div>
      </div>

      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          {[
            "saved",
            "resume_ready",
            "applied",
            "interview",
            "rejected",
            "offer",
            "withdrawn",
          ].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="btn" type="button" onClick={load}>
          Refresh
        </button>
      </div>

      {err && <div className="error">{err}</div>}

      {filtered.length === 0 ? (
        <div className="empty">No applications tracked yet.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Company</th>
                <th>Source</th>
                <th>Status</th>
                <th>Applied at</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/jobs/${encodeURIComponent(a.jobId)}`}>
                      {a.title}
                    </Link>
                  </td>
                  <td>{a.company}</td>
                  <td>
                    <span className="badge badge-source">{a.source}</span>
                  </td>
                  <td>
                    <select
                      value={a.status}
                      onChange={(e) =>
                        updateStatus(
                          a.id,
                          e.target.value as ApplicationStatus,
                        )
                      }
                    >
                      {[
                        "saved",
                        "resume_ready",
                        "applied",
                        "interview",
                        "rejected",
                        "offer",
                        "withdrawn",
                      ].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="muted">
                    {a.appliedAt
                      ? new Date(a.appliedAt).toLocaleString()
                      : "—"}
                  </td>
                  <td>
                    <a href={a.url} target="_blank" rel="noreferrer">
                      Official link
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
