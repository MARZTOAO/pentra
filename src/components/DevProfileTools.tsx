import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { banUser, unbanUser, warnUser, devUpdateProfile, type ProfilePatch } from "../lib/dev";
import { useDevMode } from "../lib/devMode";
import { REGIONS, US_STATES } from "../lib/constants";
import type { Profile } from "../lib/profile";

/**
 * The strip under another player's profile header when developer mode
 * is on: warn, ban, unban, and an editor for their profile. Draws
 * nothing otherwise. Everything here goes through dev_* functions that
 * check am_i_developer() themselves and log what was done (61, 89).
 */
export function DevProfileTools({
  profile,
  onChanged,
}: {
  profile: Profile;
  /** The profile was edited; refetch (the username may have changed). */
  onChanged: (username: string) => void;
}) {
  const on = useDevMode();
  const [mode, setMode] = useState<"idle" | "warn" | "ban" | "edit">("idle");
  const [note, setNote] = useState("");
  const [days, setDays] = useState<string>("7");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  if (!on) return null;

  async function run(action: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    const result = await action();
    setBusy(false);
    setStatus(result);
    setMode("idle");
    setNote("");
  }

  const small =
    "notch-sm border border-line px-2.5 py-1 text-2xs font-semibold text-muted transition hover:text-ink disabled:opacity-50";

  return (
    <section className="mb-6 notch-md border border-accent/40 bg-surface bg-[linear-gradient(rgb(255_122_47/0.06),rgb(255_122_47/0.06))] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-wide mr-1 text-accent">Developer</span>
        <button type="button" disabled={busy} onClick={() => setMode("edit")} className={small}>
          Edit profile
        </button>
        <button type="button" disabled={busy} onClick={() => setMode(mode === "warn" ? "idle" : "warn")} className={small}>
          Warn
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setMode(mode === "ban" ? "idle" : "ban")}
          className={small + " hover:border-danger hover:text-danger"}
        >
          Ban
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => unbanUser(profile.username))}
          className={small}
        >
          Unban
        </button>
        {status && <span className="text-2xs text-muted">{status}</span>}
      </div>

      {(mode === "warn" || mode === "ban") && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === "warn" ? "What they're being warned for" : "Reason (shown to them)"}
            maxLength={300}
            className="min-w-0 flex-1 notch-md border border-line bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          {mode === "ban" && (
            <select
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="notch-md border border-line bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            >
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="forever">Permanently</option>
            </select>
          )}
          <button
            type="button"
            disabled={busy || !note.trim()}
            onClick={() =>
              run(() =>
                mode === "warn"
                  ? warnUser(profile.username, note.trim())
                  : banUser(profile.username, note.trim(), days === "forever" ? null : Number(days)),
              )
            }
            className={
              "notch-md px-3 py-1.5 text-xs font-semibold text-onaccent transition disabled:opacity-40 " +
              (mode === "ban" ? "bg-danger hover:brightness-110" : "bg-accent hover:bg-accent-hi")
            }
          >
            {mode === "warn" ? "Send warning" : days === "forever" ? "Ban permanently" : `Ban for ${days} day${days === "1" ? "" : "s"}`}
          </button>
        </div>
      )}

      {mode === "edit" && (
        <ProfileEditor
          profile={profile}
          onClose={() => setMode("idle")}
          onSaved={(username) => {
            setMode("idle");
            setStatus("saved");
            onChanged(username);
          }}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

const field =
  "w-full notch-md border border-line bg-surface-2 px-3 py-2 text-sm outline-none transition focus:border-accent";

/**
 * Edit someone else's profile. The same fields they can edit
 * themselves, plus "clear" switches for the things that are pictures.
 * Only what you change is sent (89 leaves missing keys alone).
 */
function ProfileEditor({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: (username: string) => void;
}) {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [region, setRegion] = useState(profile.region ?? "");
  const [city, setCity] = useState(profile.location_city ?? "");
  const [stateCode, setStateCode] = useState(profile.location_state ?? "");
  const [country, setCountry] = useState(profile.location_country ?? "");
  const [clearAvatar, setClearAvatar] = useState(false);
  const [clearBackground, setClearBackground] = useState(false);
  const [clearFrame, setClearFrame] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch: ProfilePatch = {};
  if (displayName !== (profile.display_name ?? "")) patch.display_name = displayName;
  if (username !== profile.username) patch.username = username;
  if (bio !== (profile.bio ?? "")) patch.bio = bio;
  if (region !== (profile.region ?? "")) patch.region = region;
  if (city !== (profile.location_city ?? "")) patch.location_city = city;
  if (stateCode !== (profile.location_state ?? "")) patch.location_state = stateCode;
  if (country !== (profile.location_country ?? "")) patch.location_country = country;
  if (clearAvatar) patch.clear_avatar = true;
  if (clearBackground) patch.clear_background = true;
  if (clearFrame) patch.clear_frame = true;
  const dirty = Object.keys(patch).length > 0;

  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    setError(null);
    const problem = await devUpdateProfile(profile.username, patch);
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    const finalName = patch.username ?? profile.username;
    onSaved(finalName);
    if (patch.username) navigate(`/u/${finalName}`, { replace: true });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 pt-10 sm:p-6 sm:pt-16">
      <div className="w-full max-w-lg notch border border-accent/40 bg-surface">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 className="label-wide text-accent">Edit @{profile.username}</h2>
          <button onClick={onClose} aria-label="Close" className="ml-auto px-2 text-lg leading-none text-muted hover:text-ink">
            ×
          </button>
        </header>

        <div className="space-y-3 p-4">
          <p className="text-xs text-muted">
            Changes are saved under your name in the moderation log. Only what you
            change is sent.
          </p>

          <label className="block">
            <span className="mb-1 block text-xs text-muted">Display name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} className={field} />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-muted">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 20))}
              className={field + " numeric"}
            />
            <span className="mt-1 block text-2xs text-muted">
              3–20 letters, numbers or underscores. Their old links to /u/{profile.username} stop working.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-muted">Bio</span>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={3} className={field + " resize-none"} />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Region</span>
              <select value={region} onChange={(e) => setRegion(e.target.value)} className={field}>
                <option value="">—</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Country</span>
              <input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={60} className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">State (US)</span>
              <select value={stateCode} onChange={(e) => setStateCode(e.target.value)} className={field}>
                <option value="">—</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={clearAvatar} onChange={(e) => setClearAvatar(e.target.checked)} className="accent-[#ff7a2f]" />
              Remove avatar
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={clearBackground} onChange={(e) => setClearBackground(e.target.checked)} className="accent-[#ff7a2f]" />
              Remove background
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={clearFrame} onChange={(e) => setClearFrame(e.target.checked)} className="accent-[#ff7a2f]" />
              Remove frame
            </label>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || busy}
              className="notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-muted hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
