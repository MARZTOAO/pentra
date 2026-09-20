import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import {
  getProfile,
  updateProfile,
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
import { GamerTags } from "../components/GamerTags";
import { BackgroundPicker } from "../components/BackgroundPicker";
import { AvatarPicker } from "../components/AvatarPicker";
import { FriendCode } from "../components/FriendCode";
import { GameLibrary } from "../components/GameLibrary";
import { ProfileStats } from "../components/ProfileStats";
import { Achievements } from "../components/Achievements";
import { ReferralPanel } from "../components/ReferralPanel";

export default function Profile() {
  const { user } = useAuth();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /**
   * Bumped whenever something on this page changes a number another
   * panel is showing. The panels refetch on it rather than each
   * subscribing to everything that might affect them.
   */
  const [dataVersion, setDataVersion] = useState(0);

  // Editable copies of the fields.
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [country, setCountry] = useState("USA");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [primaryPlatform, setPrimaryPlatform] = useState("");
  const [availability, setAvailability] = useState<string[]>([]);

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
        setPrimaryPlatform(row.primary_platform ?? "");
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
      // Only meaningful if they actually own it.
      primary_platform: platforms.includes(primaryPlatform) ? primaryPlatform : null,
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

  if (loading) return <FullScreenLoader />;

  const isUS = country.trim().toUpperCase() === "USA";

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-8 py-6 sm:py-10">
      {/* Stacks on a phone — the heading and a "View as others see it"
          button side by side leaves neither enough room. */}
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="display text-2xl">Your profile</h1>
          <p className="mt-1 text-sm text-muted">
            This is what other players see. The more you fill in, the better your
            matches.
          </p>
        </div>

        {profile?.username && (
          <Link
            to={`/u/${profile.username}`}
            className="notch-md border border-line px-4 py-2 text-center text-sm font-medium text-muted transition hover:border-accent hover:text-accent sm:shrink-0 sm:text-left"
          >
            View as others see it
          </Link>
        )}
      </header>

      {error && <Alert>{error}</Alert>}
      {saved && <Alert kind="ok">Saved.</Alert>}

      <FriendCode code={profile?.friend_code} />

      {/* Directly under the friend code, because it is the same kind of
          thing: a code you give to somebody. It used to sit below the
          achievements grid, which on a phone is a long way down a long
          page — far enough that it read as missing. */}
      <ReferralPanel />

      {profile && (
        <AvatarPicker profile={profile} onChange={setProfile} />
      )}

      {profile && (
        <BackgroundPicker profile={profile} onChange={setProfile} />
      )}

      <TopFive />

      {/* Adding a game moves two achievements and a stat tile that
          live in the panels below. Siblings cannot see each other, so
          the change is announced upwards and passed back down. */}
      {user && (
        <GameLibrary
          userId={user.id}
          editable
          onChanged={() => setDataVersion((v) => v + 1)}
        />
      )}

      {user && (
        <ProfileStats userId={user.id} isSelf refreshKey={dataVersion} />
      )}

      {user && (
        <Achievements userId={user.id} isSelf refreshKey={dataVersion} />
      )}

      {/* Basics */}
      <section className="mb-8 notch border border-line bg-surface p-5">
        <h2 className="mb-4 label-wide text-muted">
          Basics
        </h2>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-medium">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            placeholder="What people call you"
            className="w-full notch-md border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
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
            className="w-full resize-none notch-md border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
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
            className="w-full notch-md border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
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

          {/* City gets its own row on a phone. In one row the state and
              country boxes are fixed at 96px and 144px, which left the
              city field about 55px wide — barely enough for "Min…". */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={60}
              placeholder="City"
              className="w-full notch-md border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 sm:flex-1"
            />

            <div className="flex gap-2">
              {isUS ? (
                <select
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  className="w-24 shrink-0 notch-md border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
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
                className="min-w-0 flex-1 notch-md border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 sm:w-36 sm:flex-none"
              />
            </div>
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
      <section className="mb-8 notch border border-line bg-surface p-5">
        <h2 className="mb-1 label-wide text-muted">
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

        <label className="mt-5 block border-t border-line pt-5">
          <span className="mb-1.5 block text-sm font-medium">
            Primarily plays on
          </span>
          <select
            value={platforms.includes(primaryPlatform) ? primaryPlatform : ""}
            onChange={(e) => setPrimaryPlatform(e.target.value)}
            disabled={platforms.length === 0}
            className="w-full notch-md border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
          >
            <option value="">Not set</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">
            {platforms.length === 0
              ? "Pick your platforms above first."
              : "Where you actually spend your time. Counts for more in matching than simply owning a system."}
          </span>
        </label>
      </section>

      <GamerTags />

      {/* Availability */}
      <section className="mb-8 notch border border-line bg-surface p-5">
        <h2 className="mb-1 label-wide text-muted">
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:w-40">
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
