import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { getProfileByUsername, type Profile } from "../lib/profile";
import { getTopFive, type TopFiveEntry } from "../lib/topFive";
import { formatLocation } from "../lib/constants";
import { getGamerTags, networkLabel, type GamerTag } from "../lib/gamerTags";
import { bannerStyle } from "../lib/backgrounds";
import { FriendButton } from "../components/FriendButton";
import { FullScreenLoader } from "../components/ui";
import { Avatar } from "../components/Avatar";

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [topFive, setTopFive] = useState<TopFiveEntry[]>([]);
  const [tags, setTags] = useState<GamerTag[]>([]);
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
      setTags(await getGamerTags(row.id));
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

      {/* Their background fills the whole window, not a strip at the top.
          Fixed rather than absolute so it stays put while the page
          scrolls, and behind everything via a negative z-index. */}
      <div
        className="pointer-events-none fixed inset-0 -z-20"
        style={bannerStyle(profile)}
      />
      {/* A scrim over it. Without this, text sits on whatever someone
          uploaded and readability becomes a coin flip. */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-bg/75" />

      {/* Header */}
      <header className="relative mb-8 flex items-end gap-5 pt-24">
        <Avatar of={profile} size={96} className="shrink-0 border-4 border-bg" />

        <div className="min-w-0 flex-1 pb-1">
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
          <div className="flex shrink-0 items-start gap-2 pb-1">
            <FriendButton
              targetId={profile.id}
              // Becoming friends unlocks their gamer tags, so refetch.
              onChange={() => getGamerTags(profile.id).then(setTags)}
            />
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
                  <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-onaccent shadow">
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
      <div className="mb-4 grid grid-cols-2 gap-4">
        <PlatformPanel
          primary={profile.primary_platform}
          all={profile.platforms}
        />
        <Panel title="Usually online" items={profile.availability} empty="Not set" />
      </div>

      {/* Gamer tags. The database only returns these to the person
          themselves and their accepted friends - if the list comes back
          empty, either they haven't added any or you aren't friends. */}
      <section className="rounded-xl border border-line bg-surface/85 p-5 backdrop-blur-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Gamer tags
        </h2>

        {tags.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
            {tags.map((tag) => (
              <div key={tag.network} className="flex justify-between gap-3">
                <dt className="text-sm text-muted">
                  {networkLabel(tag.network)}
                </dt>
                <dd className="truncate text-sm font-medium" title={tag.handle}>
                  {tag.handle}
                </dd>
              </div>
            ))}
          </dl>
        ) : isSelf ? (
          <p className="text-sm text-muted">
            You haven't added any yet. They're only ever shown to friends.
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            Visible once you're friends.
          </p>
        )}
      </section>
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
    <section className="rounded-xl border border-line bg-surface/85 p-5 backdrop-blur-sm">
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

/**
 * Leads with the one platform they actually play on, and lists anything
 * else underneath. Owning five systems says much less than knowing which
 * one they're on at 9pm.
 */
function PlatformPanel({
  primary,
  all,
}: {
  primary: string | null;
  all: string[] | null;
}) {
  const others = (all ?? []).filter((p) => p !== primary);

  return (
    <section className="rounded-xl border border-line bg-surface/85 p-5 backdrop-blur-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Primarily plays on
      </h2>

      {primary ? (
        <p className="mb-3 text-lg font-semibold text-accent">{primary}</p>
      ) : (
        <p className="mb-3 text-sm text-muted">Not set</p>
      )}

      {others.length > 0 && (
        <>
          <p className="mb-2 text-xs text-muted">Also plays on</p>
          <div className="flex flex-wrap gap-2">
            {others.map((item) => (
              <span
                key={item}
                className="rounded-full border border-line px-3 py-1 text-xs"
              >
                {item}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
