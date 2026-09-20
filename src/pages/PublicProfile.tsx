import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { getProfileByUsername, type Profile } from "../lib/profile";
import { getTopFive, type TopFiveEntry } from "../lib/topFive";
import { getFriendCount } from "../lib/matching";
import { GameLibrary } from "../components/GameLibrary";
import { ProfileStats } from "../components/ProfileStats";
import { formatLocation } from "../lib/constants";
import { getGamerTags, networkLabel, type GamerTag } from "../lib/gamerTags";
import { bannerStyle } from "../lib/backgrounds";
import { FriendButton } from "../components/FriendButton";
import { MessageButton } from "../components/MessageButton";
import { SafetyMenu } from "../components/SafetyMenu";
import { FullScreenLoader } from "../components/ui";
import { Avatar } from "../components/Avatar";

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [topFive, setTopFive] = useState<TopFiveEntry[]>([]);
  const [tags, setTags] = useState<GamerTag[]>([]);
  const [friendCount, setFriendCount] = useState(0);
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
      setFriendCount(await getFriendCount(row.id));
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [username]);

  if (loading) return <FullScreenLoader />;

  if (notFound || !profile) {
    return (
      <div className="flex h-full items-center justify-center p-6 sm:p-10 text-center">
        <div>
          <h1 className="mb-2 display text-xl">No such player</h1>
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
    <div className="mx-auto max-w-3xl px-4 sm:px-8 py-6 sm:py-10">
      {isSelf && (
        <div className="mb-6 flex flex-col gap-2 notch-md border border-accent/40 bg-accent/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
      {/* A scrim over it. Without one, text sits on whatever someone
          picked and readability becomes a coin flip.

          45% rather than 75% — the background is the one piece of the
          page that is theirs, and three-quarters of it was being thrown
          away. The cost is that the brightest presets now sit close to
          the muted text on top of them, so anything drawn directly on
          the artwork carries `on-art` (see index.css) and the panels
          keep their own surface. */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-bg/45" />

      {/* Header.

          Desktop is a single row: avatar, then name and bio, then the
          action buttons on the right. That is unchanged.

          A phone cannot hold that row. A 96px avatar plus Friends,
          Message and the safety menu leaves the middle column zero
          pixels wide at 375px — the bio drops to one word per line and
          the buttons run off the edge. Measured, not guessed.

          So below `sm` it becomes a column, which puts the name, bio and
          location across the full width and drops the buttons onto their
          own row underneath. */}
      <header className="relative mb-8 flex flex-col gap-4 pt-6 sm:flex-row sm:items-end sm:gap-5 sm:pt-20">
        <Avatar of={profile} size={96} className="shrink-0 border-4 border-bg" />

        <div className="min-w-0 flex-1 sm:pb-1">
          <h1 className="display on-art break-words text-2xl">
            {profile.display_name || profile.username}
          </h1>
          <p className="on-art mb-3 truncate text-sm text-muted">@{profile.username}</p>

          {profile.bio && (
            <p className="on-art mb-3 whitespace-pre-line break-words text-sm leading-relaxed">
              {profile.bio}
            </p>
          )}

          {(formatLocation(profile) || profile.region) && (
            <p className="on-art text-xs text-muted">
              {[formatLocation(profile), profile.region]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          {/* A count that goes somewhere. A number you can't act on is
              decoration; this one opens the list, ranked by how well
              each of them matches you. */}
          <Link
            to={`/u/${profile.username}/friends`}
            className="on-art mt-2 inline-flex items-baseline gap-1.5 text-sm text-muted transition hover:text-accent"
          >
            <span className="numeric font-bold text-ink">{friendCount}</span>
            {friendCount === 1 ? "friend" : "friends"}
          </Link>
        </div>

        {!isSelf && (
          <div className="flex gap-2 sm:shrink-0 sm:items-start sm:pb-1">
            <FriendButton
              targetId={profile.id}
              // Becoming friends unlocks their gamer tags, so refetch.
              onChange={() => getGamerTags(profile.id).then(setTags)}
            />
            <MessageButton targetId={profile.id} />
            <SafetyMenu targetId={profile.id} username={profile.username} />
          </div>
        )}
      </header>

      {/* Top 5 */}
      <section className="mb-8">
        <h2 className="on-art mb-4 label-wide text-muted">
          Top 5
        </h2>

        {topFive.length === 0 ? (
          <p className="notch border border-dashed border-line p-8 text-center text-sm text-muted">
            {isSelf
              ? "You haven't picked your Top 5 yet — it's the first thing people look at."
              : "This player hasn't picked a Top 5 yet."}
          </p>
        ) : (
          // Three across on a phone rather than five. At 375px, five
          // covers are 59px wide and every title truncates to about six
          // characters — a Top 5 nobody can read isn't a Top 5.
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {topFive.map((entry, index) => (
              <div key={entry.game.id}>
                <div className="relative mb-2 aspect-[3/4] overflow-hidden notch-md border border-line bg-surface-2">
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

                {/* Two lines rather than one hard cut: at three across a
                    long title like "Deep Rock Galactic" still doesn't fit
                    on one line, and half a name is no name. */}
                <p
                  className="on-art line-clamp-2 text-xs font-medium leading-snug"
                  title={entry.game.name}
                >
                  {entry.game.name}
                </p>
                {entry.platform && (
                  <p className="on-art truncate text-[11px] text-muted">
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

      <GameLibrary userId={profile.id} editable={false} />

      <ProfileStats userId={profile.id} isSelf={isSelf} />

      {/* Details. One column on a phone — side by side these panels are
          164px wide, and a chip reading "PlayStation 5" does not fit in
          the 124px left after padding. */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PlatformPanel
          primary={profile.primary_platform}
          all={profile.platforms}
        />
        <Panel title="Usually online" items={profile.availability} empty="Not set" />
      </div>

      {/* Gamer tags. The database only returns these to the person
          themselves and their accepted friends - if the list comes back
          empty, either they haven't added any or you aren't friends. */}
      <section className="notch border border-line bg-surface/85 p-4 backdrop-blur-sm sm:p-5">
        <h2 className="mb-3 label-wide text-muted">
          Gamer tags
        </h2>

        {tags.length > 0 ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
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
    <section className="notch border border-line bg-surface/85 p-4 backdrop-blur-sm sm:p-5">
      <h2 className="mb-3 label-wide text-muted">
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
    <section className="notch border border-line bg-surface/85 p-4 backdrop-blur-sm sm:p-5">
      <h2 className="mb-3 label-wide text-muted">
        Primarily plays on
      </h2>

      {primary ? (
        <p className="mb-3 display text-lg text-accent">{primary}</p>
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
