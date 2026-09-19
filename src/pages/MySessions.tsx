import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMySessions, type Post } from "../lib/feed";
import { SessionCard } from "../components/SessionCard";
import { Avatar } from "../components/Avatar";
import { FullScreenLoader } from "../components/ui";

/**
 * Everything you've agreed to turn up to.
 *
 * The feed answers "what's happening"; this answers "what am I doing
 * next", which is a different enough question to deserve its own screen
 * rather than a filter on the feed. It's also the screen you open when
 * you've forgotten whether you said yes to something.
 */
export default function MySessions() {
  const [sessions, setSessions] = useState<Post[]>([]);
  const [past, setPast] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setSessions(await getMySessions(past));
    setLoading(false);
  }, [past]);

  useEffect(() => {
    load();
  }, [load]);

  // Someone may have joined or dropped out while you were elsewhere, and
  // a stale roster on a session you're about to play is the worst place
  // to be wrong.
  useEffect(() => {
    function refresh() {
      if (document.visibilityState === "visible") load();
    }
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  if (loading) return <FullScreenLoader />;

  const next = sessions[0];

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-8 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="display text-2xl">Your sessions</h1>
        <p className="mt-1 text-sm text-muted">
          {sessions.length === 0
            ? "Nothing booked in."
            : past
              ? "Everything you've joined, including what's already been."
              : "What you've said you'll turn up to, soonest first."}
        </p>
      </header>

      {/* The next one, called out. Most of the time this is the only
          thing you opened the screen to find. */}
      {!past && next && (
        <div className="mb-6 notch-md border border-accent/40 bg-accent-dim px-4 py-3">
          <p className="label-wide mb-1 text-accent">Up next</p>
          <p className="text-sm">
            <span className="font-semibold">{next.game_name ?? "A session"}</span>
            {" — "}
            <span className="numeric">{whenLabel(next.starts_at)}</span>
            {next.players.length > 0 && (
              <span className="text-muted">
                {" with "}
                {next.players
                  .slice(0, 3)
                  .map((p) => p.display_name || p.username)
                  .join(", ")}
                {next.players.length > 3 && ` +${next.players.length - 3}`}
              </span>
            )}
          </p>
        </div>
      )}

      {sessions.length === 0 ? (
        <Empty past={past} />
      ) : (
        <div className="space-y-4">
          {sessions.map((post) => (
            <article
              key={post.id}
              className="notch border border-line bg-surface p-4"
            >
              <div className="mb-3 flex items-center gap-3">
                <Avatar of={post} size={36} className="shrink-0" />
                <div className="min-w-0">
                  <Link
                    to={`/u/${post.username}`}
                    className="truncate text-sm font-semibold hover:text-accent"
                  >
                    {post.display_name || post.username}
                  </Link>
                  <p className="text-xs text-muted">
                    {post.mine ? "You're hosting" : "You joined"}
                  </p>
                </div>
              </div>

              {post.body && (
                <p className="mb-3 whitespace-pre-wrap break-words text-sm">
                  {post.body}
                </p>
              )}

              <SessionCard post={post} onChange={load} />
            </article>
          ))}
        </div>
      )}

      <button
        onClick={() => setPast((v) => !v)}
        className="label-wide mt-6 text-muted transition hover:text-ink"
      >
        {past ? "Hide past sessions" : "Show past sessions"}
      </button>
    </div>
  );
}

/** "Tonight 21:00", "Sat 20:30", "3 Oct 19:00". */
function whenLabel(iso: string | null): string {
  if (!iso) return "no time set";

  const date = new Date(iso);
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return `Tonight ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;

  const days = (date.getTime() - today.getTime()) / 86_400_000;
  if (days < 7) {
    return `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
  }

  return `${date.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

function Empty({ past }: { past: boolean }) {
  return (
    <div className="notch border border-dashed border-line p-10 text-center">
      <h2 className="mb-2 font-semibold">
        {past ? "Nothing here yet" : "No sessions booked"}
      </h2>
      <p className="mx-auto max-w-sm text-sm text-muted">
        Sessions you join show up here.{" "}
        <Link to="/home" className="text-accent underline underline-offset-2">
          Check the feed
        </Link>{" "}
        for one that needs players, or post your own.
      </p>
    </div>
  );
}
