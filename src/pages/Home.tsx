import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { getProfile, type Profile } from "../lib/profile";
import {
  getFeed,
  getFeedGames,
  createPost,
  HEADSET_RULES,
  type Post,
  type FeedScope,
  type FeedGame,
  type HeadsetRule,
} from "../lib/feed";
import { PLATFORMS } from "../lib/constants";
import { releaseLabel, isUnreleased, type Game } from "../lib/topFive";
import { Avatar } from "../components/Avatar";
import { GameSearchModal } from "../components/GameSearchModal";
import { SessionGuests } from "../components/SessionGuests";
import { PostCard } from "../components/PostCard";
import { getCommentCounts } from "../lib/comments";
import { MentionBox } from "../components/MentionBox";
import {
  useAttachments,
  AttachmentThumbs,
  AttachButton,
} from "../components/Attachments";
import {
  uploadMedia,
  MediaError,
  type PreparedMedia,
  type UploadedMedia,
} from "../lib/media";
import { Alert, FullScreenLoader } from "../components/ui";

export default function Home() {
  const { user } = useAuth();

  const [scope, setScope] = useState<FeedScope>("everyone");
  const [gameId, setGameId] = useState<number | null>(null);
  const [sessionsOnly, setSessionsOnly] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  // One batched lookup for the whole feed. get_feed predates comments
  // and returns a fixed column list — see lib/comments.ts.
  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({});
  const [games, setGames] = useState<FeedGame[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * @param showSpinner Only for a load that changes what the feed is
   *   showing — a new scope or game filter. A refresh keeps the old
   *   posts on screen until the new ones arrive, because refreshes now
   *   happen on their own: somebody else joining a session or leaving
   *   a comment refetches the feed, and swapping the whole page for a
   *   spinner every time a stranger clicks Join would be unusable.
   */
  const load = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setLoading(true);
      const rows = await getFeed(scope, gameId, sessionsOnly);
      setPosts(rows);
      setCommentCounts(await getCommentCounts(rows.map((p) => p.id)));
      setLoading(false);
    },
    [scope, gameId, sessionsOnly],
  );

  const loadGames = useCallback(async () => {
    setGames(await getFeedGames());
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  useEffect(() => {
    if (!user) return;
    getProfile(user.id).then(({ data }) => {
      if (data) setProfile(data as Profile);
    });
  }, [user]);

  function afterPost() {
    load();
    loadGames();
  }

  const activeGame = games.find((g) => g.game_id === gameId);

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-8 py-8">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="display text-2xl">Home</h1>

        <div className="flex notch-md border border-line p-0.5">
          {(["everyone", "friends"] as FeedScope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={
                "notch-sm px-3 py-1.5 text-xs font-medium capitalize transition " +
                (scope === s
                  ? "bg-accent text-onaccent"
                  : "text-muted hover:text-ink")
              }
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      {/* Game filter. Only games people have actually posted about, so
          every option here leads somewhere. */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSessionsOnly((v) => !v)}
            className={
              "rounded-full border px-3 py-1 text-xs font-semibold transition " +
              (sessionsOnly
                ? "border-accent bg-accent text-onaccent"
                : "border-line text-muted hover:border-accent hover:text-accent")
            }
          >
            Looking for players
          </button>

          <span className="mx-1 h-4 w-px bg-line" />

          <button
            onClick={() => setGameId(null)}
            className={
              "rounded-full border px-3 py-1 text-xs font-medium transition " +
              (gameId === null
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-muted hover:border-muted hover:text-ink")
            }
          >
            All games
          </button>

          {games.slice(0, 10).map((game) => (
            <button
              key={game.game_id}
              onClick={() => setGameId(game.game_id)}
              title={`${game.posts} ${game.posts === 1 ? "post" : "posts"}`}
              className={
                "flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs font-medium transition " +
                (gameId === game.game_id
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line text-muted hover:border-muted hover:text-ink")
              }
            >
              {game.cover_url && (
                <img
                  src={game.cover_url}
                  alt=""
                  className="h-5 w-3.5 notch-sm object-cover"
                />
              )}
              <span className="max-w-40 truncate">{game.name}</span>
              <span className="opacity-60">{game.posts}</span>
            </button>
          ))}

          {games.length > 10 && (
            <select
              value={gameId && !games.slice(0, 10).some((g) => g.game_id === gameId)
                ? String(gameId)
                : ""}
              onChange={(e) =>
                setGameId(e.target.value ? Number(e.target.value) : null)
              }
              className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted outline-none focus:border-accent"
            >
              <option value="">More…</option>
              {games.slice(10).map((game) => (
                <option key={game.game_id} value={game.game_id}>
                  {game.name} ({game.posts})
                </option>
              ))}
            </select>
          )}
      </div>

      {profile && <Composer profile={profile} onPosted={afterPost} />}

      {loading ? (
        <FullScreenLoader />
      ) : posts.length === 0 ? (
        <Empty scope={scope} gameName={activeGame?.name ?? null} />
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onChange={afterPost}
              onPickGame={setGameId}
              commentCount={commentCounts[post.id] ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Defaults the time box to the next whole hour, in local time. */
function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Composer({
  profile,
  onPosted,
}: {
  profile: Profile;
  onPosted: () => void;
}) {
  const [body, setBody] = useState("");
  const [game, setGame] = useState<Game | null>(null);
  const [picking, setPicking] = useState(false);
  const [isSession, setIsSession] = useState(false);
  const [startsAt, setStartsAt] = useState(defaultStart());
  const [slots, setSlots] = useState(4);
  const [guests, setGuests] = useState<string[]>([]);
  // Null means "didn't say", which is a real answer and the one every
  // session posted before today gives.
  const [platform, setPlatform] = useState<string | null>(null);
  const [headset, setHeadset] = useState<HeadsetRule | null>(null);
  const [media, setMedia] = useState<PreparedMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const attach = useAttachments(media, setMedia);

  // A picture on its own is a perfectly good post.
  const canPost = body.trim().length > 0 || media.length > 0;

  async function submit() {
    if (!canPost || busy) return;

    setBusy(true);
    setError(null);

    if (isSession && !startsAt) {
      setBusy(false);
      setError("Pick a time for the session.");
      return;
    }

    // Files go up first, then the post that points at them. A failed
    // upload this way costs a stray file; the other order would leave
    // a post pointing at a picture that never arrived.
    const uploaded: UploadedMedia[] = [];

    try {
      for (let i = 0; i < media.length; i++) {
        setUploading(i + 1);
        uploaded.push(await uploadMedia(profile.id, media[i]));
      }
    } catch (e) {
      setBusy(false);
      setUploading(0);
      setError(
        e instanceof MediaError ? e.message : "Couldn't upload that. Try again?",
      );
      return;
    }

    setUploading(0);

    const { error } = await createPost(
      body.trim(),
      game?.id ?? null,
      isSession
        ? {
            startsAt: new Date(startsAt).toISOString(),
            slots,
            guests,
            platform,
            headset,
          }
        : null,
      uploaded,
    );

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    media.forEach((m) => URL.revokeObjectURL(m.previewUrl));

    setBody("");
    setGame(null);
    setMedia([]);
    setIsSession(false);
    setStartsAt(defaultStart());
    setSlots(4);
    setGuests([]);
    setPlatform(null);
    setHeadset(null);
    onPosted();
  }

  return (
    <section className="mb-5 notch border border-line bg-surface p-4">
      {error && <Alert>{error}</Alert>}

      <div className="flex gap-3">
        <Avatar of={profile} size={40} />

        <div className="min-w-0 flex-1">
          <MentionBox
            value={body}
            onChange={setBody}
            maxLength={500}
            rows={2}
            placeholder={
              isSession
                ? "What are you playing, and what are you after? \"Ranked, mics on, no rage.\""
                : "Looking for a group? Just finished something good? Say it here."
            }
            className="w-full resize-none notch-md border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
          />

          {/* Session details. Hidden until asked for, so an ordinary
              post stays a single box. */}
          {isSession && (
            <div className="mt-2 flex flex-wrap items-center gap-2 notch-md border border-accent/40 bg-accent/5 p-2.5">
              <label className="flex items-center gap-2 text-xs text-muted">
                When
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="notch-md border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
                />
              </label>

              <label className="flex items-center gap-2 text-xs text-muted">
                Players
                <select
                  value={slots}
                  onChange={(e) => setSlots(Number(e.target.value))}
                  className="notch-md border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
                >
                  {Array.from({ length: 19 }).map((_, i) => (
                    <option key={i + 2} value={i + 2}>
                      {i + 2}
                    </option>
                  ))}
                </select>
              </label>

              <span className="text-xs text-muted">
                Including you — {slots - 1} {slots === 2 ? "slot" : "slots"} for
                others.
              </span>

              <label className="flex items-center gap-2 text-xs text-muted">
                System
                <select
                  value={platform ?? ""}
                  onChange={(e) => setPlatform(e.target.value || null)}
                  className="notch-md border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
                >
                  <option value="">Any</option>
                  {PLATFORMS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs text-muted">
                Voice
                <select
                  value={headset ?? ""}
                  onChange={(e) =>
                    setHeadset((e.target.value || null) as HeadsetRule | null)
                  }
                  className="notch-md border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
                >
                  <option value="">Didn't say</option>
                  {HEADSET_RULES.map((rule) => (
                    <option key={rule.value} value={rule.value}>
                      {rule.label}
                    </option>
                  ))}
                </select>
              </label>

              <SessionGuests
                selected={guests}
                onChange={setGuests}
                max={slots - 1}
              />

              {/* Scheduling before a game is out is usually a slip, but
                  not always — launch times move, and early access is a
                  thing. Say it, don't block it. */}
              {game &&
                isUnreleased(game) &&
                startsAt &&
                new Date(startsAt) < new Date(game.release_date as string) && (
                  <p className="w-full text-xs text-accent">
                    Heads up — {game.name} isn't out until{" "}
                    {new Date(game.release_date as string).toLocaleDateString([], {
                      day: "numeric",
                      month: "long",
                    })}
                    . You can still post this.
                  </p>
                )}
            </div>
          )}

          <AttachmentThumbs attach={attach} />

          {/* Wraps on a phone. Without flex-wrap a long game title
              pushed Photo and Post off the right edge, so there was no
              way to post a session with a game tagged. Post keeps
              ml-auto, so when it drops to its own line it stays on the
              right where a thumb expects it. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsSession((v) => !v)}
              title="Post a session others can join"
              className={
                "whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition " +
                (isSession
                  ? "border-accent bg-accent text-onaccent"
                  : "border-line text-muted hover:border-accent hover:text-accent")
              }
            >
              {isSession ? "Session" : "+ Session"}
            </button>

            {/* Tagging the game is what makes a post findable by someone
                looking for that game, rather than only by whoever
                happens to scroll past it. */}
            {game ? (
              <span
                // min-w-0 + max-w-full let the chip shrink to the row
                // instead of forcing the row wider than the screen; the
                // title then truncates inside it.
                className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-accent/50 bg-accent/10 py-1 pl-1 pr-2 text-xs text-accent"
                title={game.name}
              >
                {game.cover_url && (
                  <img
                    src={game.cover_url}
                    alt=""
                    className="h-5 w-3.5 shrink-0 notch-sm object-cover"
                  />
                )}
                <span className="min-w-0 max-w-40 truncate">{game.name}</span>
                {releaseLabel(game) && (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-accent/20 px-1.5 text-[10px] font-semibold">
                    {releaseLabel(game)}
                  </span>
                )}
                <button
                  onClick={() => setGame(null)}
                  aria-label="Remove game"
                  className="shrink-0 opacity-70 hover:opacity-100"
                >
                  ×
                </button>
              </span>
            ) : (
              <button
                onClick={() => setPicking(true)}
                className="whitespace-nowrap rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-accent"
              >
                + Tag a game
              </button>
            )}

            <AttachButton attach={attach} disabled={busy} />

            <span className="whitespace-nowrap text-xs text-muted">
              {body.length}/500
            </span>

            <button
              onClick={submit}
              disabled={!canPost || busy}
              className="ml-auto shrink-0 whitespace-nowrap notch-md bg-accent px-4 py-1.5 text-sm font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
            >
              {uploading > 0
                ? `Uploading ${uploading}/${media.length}…`
                : busy
                  ? "Posting…"
                  : "Post"}
            </button>
          </div>
        </div>
      </div>

      {picking && (
        <GameSearchModal
          excludeIds={[]}
          onClose={() => setPicking(false)}
          onPick={(g) => {
            setGame(g);
            setPicking(false);
          }}
        />
      )}
    </section>
  );
}

function Empty({
  scope,
  gameName,
}: {
  scope: FeedScope;
  gameName: string | null;
}) {
  return (
    <div className="notch border border-dashed border-line p-12 text-center">
      <h2 className="mb-2 font-semibold">
        {gameName
          ? `Nothing about ${gameName} yet`
          : scope === "friends"
            ? "Nothing from your friends yet"
            : "Nothing here yet"}
      </h2>
      <p className="mx-auto max-w-sm text-sm text-muted">
        {gameName ? (
          "Post the first one — tag it with that game and anyone filtering for it will see it."
        ) : scope === "friends" ? (
          <>
            Switch to Everyone, or{" "}
            <Link to="/discover" className="text-accent hover:underline">
              find some players
            </Link>
            .
          </>
        ) : (
          "Be the first to post something."
        )}
      </p>
    </div>
  );
}
