import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Metrics } from "../api/client";

export default function DashboardPage() {
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .metrics()
      .then(setM)
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="error">{err}</div>;
  if (!m) return <div className="muted">Loading metrics…</div>;

  const applied =
    (m.byStatus.applied ?? 0) +
    (m.byStatus.interview ?? 0) +
    (m.byStatus.offer ?? 0) +
    (m.byStatus.rejected ?? 0);
  const maxCompany = Math.max(1, ...m.byCompany.map((c) => c.count));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>
            Track Data Engineer roles you care about. Apply on official sites,
            then log it here.
          </p>
        </div>
      </div>

      <div className="alert">
        Auto-apply is intentionally disabled. Use{" "}
        <strong>Open official apply</strong> on a job, submit yourself, then
        mark <strong>Applied</strong>.
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="label">DE jobs in store</div>
          <div className="value">{m.deJobs}</div>
        </div>
        <div className="stat">
          <div className="label">Applications tracked</div>
          <div className="value">{m.applicationsTotal}</div>
        </div>
        <div className="stat">
          <div className="label">Submitted / in pipeline</div>
          <div className="value">{applied}</div>
        </div>
        <div className="stat">
          <div className="label">Interviews</div>
          <div className="value">{m.byStatus.interview ?? 0}</div>
        </div>
      </div>

      <div className="detail-layout">
        <div className="card">
          <h3>By status</h3>
          <div className="stack" style={{ marginTop: "0.75rem" }}>
            {Object.entries(m.byStatus).map(([status, count]) => (
              <div key={status} className="bar-row">
                <div className="bar-label">{status}</div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.min(100, (count / Math.max(1, m.applicationsTotal)) * 100)}%`,
                    }}
                  />
                </div>
                <div className="bar-count">{count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Where you engaged</h3>
          {m.byCompany.length === 0 ? (
            <p className="muted">No applications yet — start from DE Jobs.</p>
          ) : (
            m.byCompany.map((c) => (
              <div key={c.company} className="bar-row">
                <div className="bar-label" title={c.company}>
                  {c.company}
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(c.count / maxCompany) * 100}%` }}
                  />
                </div>
                <div className="bar-count">{c.count}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h3>Recent activity</h3>
        {m.recentApplications.length === 0 ? (
          <p className="muted">Nothing tracked yet.</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: "0.75rem", border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {m.recentApplications.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link to={`/jobs/${encodeURIComponent(a.jobId)}`}>
                        {a.title}
                      </Link>
                    </td>
                    <td>{a.company}</td>
                    <td>
                      <span className="badge badge-status">{a.status}</span>
                    </td>
                    <td className="muted">
                      {new Date(a.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
          Last job sync:{" "}
          {m.lastJobSyncAt
            ? new Date(m.lastJobSyncAt).toLocaleString()
            : "never — run npm run pipeline:de"}
        </p>
      </div>
    </div>
  );
}
