import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { getProfileByUsername, hasPlus, type Profile } from "../lib/profile";
import { getTopFive, type TopFiveEntry } from "../lib/topFive";
import { getFriendCount } from "../lib/matching";
import { GameLibrary } from "../components/GameLibrary";
import { ProfileStats } from "../components/ProfileStats";
import { RatingBadge } from "../components/RatingBadge";
import { Achievements } from "../components/Achievements";
import { ProfileMatch } from "../components/ProfileMatch";
import { formatLocation } from "../lib/constants";
import { getGamerTags, networkLabel, type GamerTag } from "../lib/gamerTags";
import { bannerStyle } from "../lib/backgrounds";
import { FriendButton } from "../components/FriendButton";
import { getFriendStatus, type FriendStatus } from "../lib/friends";
import { MessageButton } from "../components/MessageButton";
import { CommendButton } from "../components/CommendButton";
import { SafetyMenu } from "../components/SafetyMenu";
import { FullScreenLoader } from "../components/ui";
import { Avatar } from "../components/Avatar";
import { frameOf } from "../lib/frames";
import { MotionBackground } from "../components/MotionBackground";
import { DevProfileTools } from "../components/DevProfileTools";
import { SeededTag } from "../components/SeededTag";
import { ProfileFeed } from "../components/ProfileFeed";
import { ArcadeCard } from "../components/ArcadeCard";

/**
 * A player's profile as everyone sees it.
 *
 * Also YOUR profile: the Profile tab lands here (via MyProfile in
 * App.tsx, which passes your own username), with a gear in the corner
 * that opens the editor at /me/edit. Looking at yourself the way
 * others do is the default; editing is the step you take from there.
 *
 * @param username Overrides the one in the URL — how /me reuses this
 *   page without a redirect through /u/yourname.
 */
export default function PublicProfile({ username: fixed }: { username?: string } = {}) {
  const params = useParams<{ username: string }>();
  const username = fixed ?? params.username;
  const { user } = useAuth();
  // Which tab: profile (default), stats or achievements. In the URL
  // (?tab=stats) so a tab can be linked to and survives a refresh.
  const [search, setSearch] = useSearchParams();
  const tab = (["profile", "stats", "achievements"] as const).find((t) => t === search.get("tab")) ?? "profile";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [topFive, setTopFive] = useState<TopFiveEntry[]>([]);
  const [tags, setTags] = useState<GamerTag[]>([]);
  // Only to word the empty gamer-tags box honestly: "no tags yet" for
  // a friend, "visible once you're friends" for everyone else. The
  // database decides what is actually returned either way.
  const [friendStatus, setFriendStatus] = useState<FriendStatus>("none");
  const [friendCount, setFriendCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Bumped to refetch in place — after a developer edits the profile.
  const [reloads, setReloads] = useState(0);

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
      setFriendStatus(await getFriendStatus(row.id));
      setFriendCount(await getFriendCount(row.id));
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [username, reloads]);

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
      {/* Their background fills the whole window, not a strip at the top.
          Fixed rather than absolute so it stays put while the page
          scrolls, and behind everything via a negative z-index. */}
      <div
        className="pointer-events-none fixed inset-0 -z-20"
        style={bannerStyle(profile)}
      >
        {/* Pro only: the moving layer, over the still colour. */}
        {hasPlus(profile) && <MotionBackground preset={profile.background} />}
      </div>
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

          Two rows. Row one: avatar, then name, handle, badges, bio and
          location, using the full width of the column. Row two: the
          action buttons, on their own line under the text.

          It used to be one row with the buttons on the right. Inside
          the page's 3xl column, Friends + Message + Commend + the menu
          took ~360px, which left the middle ~230px: a fifteen-letter
          username broke onto two lines and the four badges stacked one
          per line. Buttons underneath cost one row of height and give
          the name the whole width back.

          Below `sm` the avatar goes above the text instead of beside
          it, for the same reason the buttons went underneath. */}
      <header className="relative mb-8 pt-6 sm:pt-20">
        {/* Yours: the way in to editing. A gear in the corner rather
            than a banner across the top — this is your profile, not a
            preview of it, and the controls shouldn't crowd the page
            everyone else sees. */}
        {isSelf && (
          <Link
            to="/me/edit"
            title="Edit profile"
            aria-label="Edit profile"
            className="absolute right-0 top-6 z-10 inline-flex items-center gap-2 notch-md border border-line bg-surface/85 px-3 py-2 text-sm font-medium text-muted backdrop-blur-sm transition hover:border-accent hover:text-accent sm:top-20"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            <span className="hidden sm:inline">Edit profile</span>
          </Link>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <Avatar
            of={profile}
            size={96}
            className="shrink-0 border-4 border-bg"
            frame={frameOf(profile)}
          />

          <div className={"min-w-0 flex-1 sm:pt-1" + (isSelf ? " pr-12 sm:pr-0" : "")}>
            <h1 className="display on-art break-words text-2xl leading-tight">
              {profile.display_name || profile.username}
            </h1>
            <p className="on-art mb-3 flex items-center gap-2 text-sm text-muted">
              <span className="truncate">@{profile.username}</span>
              <SeededTag userId={profile.id} />
            </p>

            <RatingBadge
              rating={profile.rating}
              commendations={profile.commendation_count}
              ogNumber={profile.og_number}
              pro={hasPlus(profile)}
              isSelf={isSelf}
              className="mb-3"
            />

            {profile.bio && (
              <p className="on-art mb-2 whitespace-pre-line break-words text-sm leading-relaxed">
                {profile.bio}
              </p>
            )}

            {/* Location, region and the friend count on one line. The
                count goes somewhere: it opens the list, ranked by how
                well each of them matches you. */}
            <p className="on-art flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
              {(formatLocation(profile) || profile.region) && (
                <span>
                  {[formatLocation(profile), profile.region]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
              <Link
                to={`/u/${profile.username}/friends`}
                className="inline-flex items-baseline gap-1 transition hover:text-accent"
              >
                <span className="numeric text-sm font-bold text-ink">{friendCount}</span>
                {friendCount === 1 ? "friend" : "friends"}
              </Link>
            </p>
          </div>
        </div>

        {!isSelf && (
          <div className="mt-4 flex flex-wrap items-start gap-2 sm:pl-[116px]">
            <FriendButton
              targetId={profile.id}
              // Becoming friends unlocks their gamer tags, so refetch.
              onChange={() => {
                getGamerTags(profile.id).then(setTags);
                getFriendStatus(profile.id).then(setFriendStatus);
              }}
            />
            <MessageButton targetId={profile.id} />
            <CommendButton
              targetId={profile.id}
              name={profile.display_name || profile.username}
              // Show the new count straight away rather than refetching
              // the whole profile. Standing mirrors the database's
              // +5, capped at 100.
              onCommended={() =>
                setProfile((p) =>
                  p
                    ? {
                        ...p,
                        commendation_count: p.commendation_count + 1,
                        rating: Math.min(100, p.rating + 5),
                      }
                    : p,
                )
              }
            />
            <SafetyMenu targetId={profile.id} username={profile.username} />
          </div>
        )}
      </header>

      {/* Developer mode only (draws nothing otherwise): warn, ban,
          unban, edit. Not on your own profile. */}
      {!isSelf && (
        <DevProfileTools
          profile={profile}
          onChanged={(name) => {
            // Same name: refetch here. New name: the editor has already
            // navigated to /u/<new>, which refetches on its own.
            if (name === profile.username) setReloads((n) => n + 1);
          }}
        />
      )}

      {/* How well you two match, worked out live. Not for your own
          profile — a percentage against yourself is nonsense. */}
      {!isSelf && <ProfileMatch userId={profile.id} />}

      {/* Stats and achievements get their own tabs (MARZ, 2026-10-03:
          "so they don't show on the main page of profile"); the
          profile tab is the player — Top 5, games, platforms, tags —
          and then their feed. */}
      <nav className="mb-6 flex gap-1 border-b border-line/70" aria-label="Profile sections">
        {(
          [
            ["profile", "Profile"],
            ["stats", "Stats"],
            ["achievements", "Achievements"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              const next = new URLSearchParams(search);
              if (key === "profile") next.delete("tab");
              else next.set("tab", key);
              setSearch(next, { replace: true });
            }}
            aria-current={tab === key ? "page" : undefined}
            className={
              "on-art -mb-px border-b-2 px-3 py-2 text-sm font-semibold transition " +
              (tab === key
                ? "border-accent text-ink"
                : "border-transparent text-muted hover:text-ink")
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "stats" && <ProfileStats userId={profile.id} isSelf={isSelf} />}
      {tab === "achievements" && <Achievements userId={profile.id} isSelf={isSelf} />}

      {tab === "profile" && (
      <>
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
                  <p className="on-art truncate text-2xs text-muted">
                    {entry.platform}
                  </p>
                )}
                {entry.note && (
                  <p className="mt-1 text-2xs leading-snug text-muted">
                    “{entry.note}”
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <GameLibrary userId={profile.id} editable={false} />

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
        ) : friendStatus === "friend" ? (
          <p className="text-sm text-muted">They haven't added any gamer tags yet.</p>
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

      {/* Arcade bests (93), then everything they're part of. */}
      <ArcadeCard userId={profile.id} isSelf={isSelf} />
      <ProfileFeed userId={profile.id} isSelf={isSelf} />
      </>
      )}
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
