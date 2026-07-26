import { useEffect, useState } from "react";
import { api, type Profile } from "../api/client";

export default function ResumePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getProfile()
      .then((r) => setProfile(r.profile))
      .catch((e) => setErr(e.message));
  }, []);

  async function save() {
    if (!profile) return;
    setBusy(true);
    setMsg("");
    try {
      const { profile: p } = await api.saveProfile(profile);
      setProfile(p);
      setMsg("Profile & base resume saved");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (err && !profile) return <div className="error">{err}</div>;
  if (!profile) return <div className="muted">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Base resume & profile</h1>
          <p>
            Used when generating JD-aligned drafts. Keep this truthful — tailoring
            only re-emphasizes skills.
          </p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy}
          onClick={save}
        >
          Save
        </button>
      </div>

      {msg && <div className="alert">{msg}</div>}
      {err && <div className="error">{err}</div>}

      <div className="card stack">
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <input
            placeholder="Full name"
            value={profile.fullName}
            onChange={(e) =>
              setProfile({ ...profile, fullName: e.target.value })
            }
          />
          <input
            placeholder="Email"
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
          />
          <input
            placeholder="Phone"
            value={profile.phone}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
          />
          <input
            placeholder="LinkedIn URL"
            value={profile.linkedin || ""}
            onChange={(e) =>
              setProfile({ ...profile, linkedin: e.target.value })
            }
          />
          <input
            placeholder="Location"
            value={profile.location || ""}
            onChange={(e) =>
              setProfile({ ...profile, location: e.target.value })
            }
          />
        </div>
        <label className="muted">
          Base resume text (paste your master resume)
          <textarea
            value={profile.baseResumeText}
            onChange={(e) =>
              setProfile({ ...profile, baseResumeText: e.target.value })
            }
            style={{ minHeight: 420, marginTop: 8 }}
          />
        </label>
      </div>
    </div>
  );
}
