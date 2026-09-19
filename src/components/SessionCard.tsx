import { useState } from "react";
import { Link } from "react-router-dom";
import {
  joinSession,
  leaveSession,
  removeSessionPlayer,
  sessionTime,
  startsIn,
  type Post,
} from "../lib/feed";
import { Avatar } from "./Avatar";

/**
 * The session panel inside a post: when, who's in, and the slots
 * still open.
 *
 * Empty slots are drawn as dashed circles rather than written as
 * "2 spaces left". Seeing three gaps where faces should be is a far
 * stronger prompt to join than a number is.
 */
export function SessionCard({
  post,
  onChange,
}: {
  post: Post;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const slots = post.slots ?? 0;
  const taken = Number(post.taken ?? 0);
  const open = Math.max(0, slots - taken);
  const started = post.starts_at
    ? new Date(post.starts_at).getTime() < Date.now()
    : false;

  async function join() {
    setBusy(true);
    setNote(null);

    const { data, error } = await joinSession(post.id);

    setBusy(false);

    if (error) {
      setNote(error.message);
      return;
    }

    // The function reports what happened rather than just failing,
    // so we can say something specific.
    if (data === "full") setNote("That filled up first.");
    else if (data === "past") setNote("That session has already started.");
    else onChange();
  }

  async function drop(userId: string) {
    setBusy(true);
    setNote(null);

    const { error } = await removeSessionPlayer(post.id, userId);

    setBusy(false);

    if (error) setNote(error.message);
    else onChange();
  }

  async function leave() {
    setBusy(true);
    setNote(null);

    const { error } = await leaveSession(post.id);

    setBusy(false);

    if (error) setNote(error.message);
    else onChange();
  }

  const countdown = post.starts_at ? startsIn(post.starts_at) : null;

  return (
    <div
      className={
        "mt-3 rounded-xl border p-3 " +
        (started
          ? "border-line bg-surface-2/50 opacity-70"
          : open > 0
            ? "border-accent/40 bg-accent/5"
            : "border-ok/40 bg-ok/5")
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {post.starts_at ? sessionTime(post.starts_at) : "No time set"}
        </span>

        {countdown && !started && (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
            {countdown}
          </span>
        )}

        <span className="ml-auto text-xs text-muted">
          {taken}/{slots} players
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {post.players.map((player) => (
          <span key={player.username} className="group relative">
            <Link
              to={`/u/${player.username}`}
              title={
                (player.display_name || player.username) +
                (player.is_host ? " (host)" : "")
              }
              className="block"
            >
              <Avatar
                of={{
                  username: player.username,
                  avatar_url: player.avatar_url,
                  avatar_preset: player.avatar_preset,
                }}
                size={32}
                className={player.is_host ? "ring-2 ring-accent" : ""}
              />
            </Link>

            {/* The host's undo for adding the wrong person. Hidden
                until hover so the line of faces stays clean. */}
            {post.mine && !player.is_host && !started && (
              <button
                onClick={() => drop(player.user_id)}
                disabled={busy}
                aria-label={`Remove ${player.display_name || player.username}`}
                title={`Remove ${player.display_name || player.username}`}
                className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white group-hover:flex"
              >
                ×
              </button>
            )}
          </span>
        ))}

        {/* The gaps. */}
        {Array.from({ length: open }).map((_, i) => (
          <div
            key={`open-${i}`}
            title="Open slot"
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-line text-xs text-muted"
          >
            +
          </div>
        ))}
      </div>

      {note && <p className="mb-2 text-xs text-danger">{note}</p>}

      {started ? (
        <p className="text-xs text-muted">This session has started.</p>
      ) : post.mine ? (
        <p className="text-xs text-muted">
          You're hosting{open > 0 ? ` — ${open} ${open === 1 ? "slot" : "slots"} still open` : ""}.
          Delete the post to cancel it.
        </p>
      ) : post.i_joined ? (
        <button
          onClick={leave}
          disabled={busy}
          className="rounded-lg border border-ok/50 px-3 py-1.5 text-xs font-semibold text-ok transition hover:border-danger hover:text-danger disabled:opacity-50"
        >
          {busy ? "…" : "You're in — leave"}
        </button>
      ) : open > 0 ? (
        <button
          onClick={join}
          disabled={busy}
          className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-50"
        >
          {busy ? "Joining…" : `Join — ${open} ${open === 1 ? "slot" : "slots"} left`}
        </button>
      ) : (
        <p className="text-xs text-muted">Full.</p>
      )}
    </div>
  );
}
