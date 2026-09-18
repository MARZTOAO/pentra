import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { getProfileByUsername, type Profile } from "../lib/profile";
import { getTopFive, type TopFiveEntry } from "../lib/topFive";
import { formatLocation } from "../lib/constants";
import { FullScreenLoader } from "../components/ui";

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [topFive, setTopFive] = useState<TopFiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!username) return;

    let active = true;
    setLoading(true);
    setNotFound(false);

    getProfileByUsername(username).then(async ({ data, error }) => {
      if (!active) return;

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const row = data as Profile;
      setProfile(row);
      setTopFive(await getTopFive(row.id));
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [username]);

  if (loading) return <FullScreenLoader />;

  if (notFound || !profile) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-center">
        <div>
          <h1 className="mb-2 text-xl font-semibold">No such player</h1>
          <p className="mb-6 text-sm text-muted">
            Nobody here goes by @{username}.
          </p>
          <Link to="/me" className="text-sm font-medium text-accent hover:underline">
            Back to your profile
          </Link>
        </div>
      </div>
    );
  }

  const isSelf = user?.id === profile.id;

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      {isSelf && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-accent/40 bg-accent/10 px-4 py-3">
          <p className="text-sm text-accent">
            This is how your profile looks to everyone else.
          </p>
          <Link
            to="/me"
            className="text-sm font-medium text-accent underline underline-offset-2"
          >
            Back to editing
          </Link>
        </div>
      )}

      {/* Header */}
      <header className="mb-8 flex items-start gap-5">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border border-line bg-surface-2">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-muted">
              {profile.username.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">
            {profile.display_name || profile.username}
          </h1>
          <p className="mb-3 text-sm text-muted">@{profile.username}</p>

          {profile.bio && (
            <p className="mb-3 text-sm leading-relaxed">{profile.bio}</p>
          )}

          {(formatLocation(profile) || profile.region) && (
            <p className="text-xs text-muted">
              {[formatLocation(profile), profile.region]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>

        {!isSelf && (
          <div className="flex shrink-0 gap-2">
            <button
              disabled
              title="Arrives in Phase 4"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white opacity-40"
            >
              Add friend
            </button>
            <button
              disabled
              title="Arrives in Phase 5"
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted opacity-40"
            >
              Message
            </button>
          </div>
        )}
      </header>

      {/* Top 5 */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          Top 5
        </h2>

        {topFive.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
            {isSelf
              ? "You haven't picked your Top 5 yet — it's the first thing people look at."
              : "This player hasn't picked a Top 5 yet."}
          </p>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {topFive.map((entry, index) => (
              <div key={entry.game.id}>
                <div className="relative mb-2 aspect-[3/4] overflow-hidden rounded-lg border border-line bg-surface-2">
                  {entry.game.cover_url && (
                    <img
                      src={entry.game.cover_url}
                      alt={entry.game.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                  <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white shadow">
                    {index + 1}
                  </span>
                </div>

                <p
                  className="truncate text-xs font-medium"
                  title={entry.game.name}
                >
                  {entry.game.name}
                </p>
                {entry.platform && (
                  <p className="truncate text-[11px] text-muted">
                    {entry.platform}
                  </p>
                )}
                {entry.note && (
                  <p className="mt-1 text-[11px] leading-snug text-muted">
                    “{entry.note}”
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Details */}
      <div className="grid grid-cols-2 gap-4">
        <Panel title="Plays on" items={profile.platforms} empty="Not set" />
        <Panel title="Usually online" items={profile.availability} empty="Not set" />
      </div>
    </div>
  );
}

function Panel({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[] | null;
  empty: string;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {!items || items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="rounded-full border border-line px-3 py-1 text-xs"
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
