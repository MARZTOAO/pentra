import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import {
  getProfile,
  updateProfile,
  uploadAvatar,
  type Profile as ProfileRow,
} from "../lib/profile";
import {
  PLATFORMS,
  AVAILABILITY,
  REGIONS,
  US_STATES,
  formatLocation,
} from "../lib/constants";
import { Button, Alert, FullScreenLoader } from "../components/ui";
import { TopFive } from "../components/TopFive";

export default function Profile() {
  const { user } = useAuth();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Editable copies of the fields.
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [country, setCountry] = useState("USA");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [availability, setAvailability] = useState<string[]>([]);

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;

    getProfile(user.id).then(({ data, error }) => {
      if (error) {
        setError(error.message);
      } else if (data) {
        const row = data as ProfileRow;
        setProfile(row);
        setDisplayName(row.display_name ?? "");
        setBio(row.bio ?? "");
        setRegion(row.region ?? "");
        setCity(row.location_city ?? "");
        setStateCode(row.location_state ?? "");
        setCountry(row.location_country ?? "USA");
        setPlatforms(row.platforms ?? []);
        setAvailability(row.availability ?? []);
      }
      setLoading(false);
    });
  }, [user]);

  function toggle(list: string[], value: string, set: (v: string[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    const { data, error } = await updateProfile(user.id, {
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
      region: region || null,
      location_city: city.trim() || null,
      // A state code only makes sense inside the US.
      location_state: country.trim().toUpperCase() === "USA" ? stateCode || null : null,
      location_country: country.trim() || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      platforms,
      availability,
    });

    setSaving(false);

    if (error) setError(error.message);
    else {
      setProfile(data as ProfileRow);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  async function handleAvatar(file: File) {
    if (!user) return;

    if (file.size > 2 * 1024 * 1024) {
      setError("That image is over 2 MB. Try a smaller one.");
      return;
    }

    setUploading(true);
    setError(null);

    const { url, error: uploadError } = await uploadAvatar(user.id, file);

    if (uploadError || !url) {
      setUploading(false);
      setError(uploadError?.message ?? "Upload failed.");
      return;
    }

    const { data, error: saveError } = await updateProfile(user.id, {
      avatar_url: url,
    });

    setUploading(false);

    if (saveError) setError(saveError.message);
    else setProfile(data as ProfileRow);
  }

  if (loading) return <FullScreenLoader />;

  const isUS = country.trim().toUpperCase() === "USA";

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Your profile</h1>
          <p className="mt-1 text-sm text-muted">
            This is what other players see. The more you fill in, the better your
            matches.
          </p>
        </div>

        {profile?.username && (
          <Link
            to={`/u/${profile.username}`}
            className="shrink-0 rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-accent"
          >
            View as others see it
          </Link>
        )}
      </header>

      {error && <Alert>{error}</Alert>}
      {saved && <Alert kind="ok">Saved.</Alert>}

      {/* Avatar + username */}
      <section className="mb-8 flex items-center gap-5 rounded-xl border border-line bg-surface p-5">
        <div className="relative">
          <div className="h-20 w-20 overflow-hidden rounded-full border border-line bg-surface-2">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted">
                {(profile?.username ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1">
          <p className="text-lg font-semibold">@{profile?.username}</p>
          <p className="mb-3 text-xs text-muted">
            Your username can't be changed for now.
          </p>

          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAvatar(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-muted hover:text-ink disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Change picture"}
          </button>
        </div>
      </section>

      <TopFive />

      {/* Basics */}
      <section className="mb-8 rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          Basics
        </h2>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-medium">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            placeholder="What people call you"
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-medium">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Chill co-op, hate PvP, will absolutely carry you through a raid."
            className="w-full resize-none rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <span className="mt-1 block text-right text-xs text-muted">
            {bio.length}/500
          </span>
        </label>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-medium">Region</span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
          >
            <option value="">Not set</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">
            Used for ping and timezone matching.
          </span>
        </label>

        <div className="block">
          <span className="mb-1.5 block text-sm font-medium">Location</span>

          <div className="flex gap-2">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={60}
              placeholder="City"
              className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
            />

            {isUS ? (
              <select
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                className="w-24 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
              >
                <option value="">State</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : null}

            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              maxLength={60}
              placeholder="Country"
              className="w-36 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </div>

          <span className="mt-1 block text-xs text-muted">
            Optional, and shown on your profile — it'll read “
            {formatLocation({
              location_city: city,
              location_state: isUS ? stateCode : null,
              location_country: country,
            }) ?? "nothing yet"}
            ”. City level only. Never put your street or exact address here.
          </span>
        </div>
      </section>

      {/* Platforms */}
      <section className="mb-8 rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Platforms
        </h2>
        <p className="mb-4 text-xs text-muted">
          What you play on. Without at least one overlap, you can't play together.
        </p>
        <Chips
          options={[...PLATFORMS]}
          selected={platforms}
          onToggle={(v) => toggle(platforms, v, setPlatforms)}
        />
      </section>

      {/* Availability */}
      <section className="mb-8 rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          When you play
        </h2>
        <p className="mb-4 text-xs text-muted">
          The single best predictor of whether two people actually end up in a
          game together.
        </p>
        <Chips
          options={[...AVAILABILITY]}
          selected={availability}
          onToggle={(v) => toggle(availability, v, setAvailability)}
        />
      </section>

      <div className="flex items-center gap-3">
        <div className="w-40">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
        <p className="text-xs text-muted">
          Your Top 5 saves separately, with its own button.
        </p>
      </div>
    </div>
  );
}

function Chips({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition " +
              (on
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-muted hover:border-muted hover:text-ink")
            }
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
