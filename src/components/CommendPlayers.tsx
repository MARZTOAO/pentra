import { useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import {
  commend,
  commendableIn,
  COMMEND_COOLDOWN_DAYS,
  sessionCommendables,
  type Commendable,
} from "../lib/ratings";

/**
 * The thumbs-up row on a session that has started.
 *
 * WHY IT ONLY APPEARS AFTER THE START TIME. Commending somebody for a
 * session that has not happened is a button two accounts can press at
 * each other on a schedule. The database refuses it as well — this is
 * the polite half of that rule.
 *
 * ONE PER PERSON PER 30 DAYS, not per session — and shared with the
 * Commend button on profiles, so a commendation from either place
 * starts the same clock. The cooldown is the database's rule; this
 * just shows when it lifts.
 *
 * Nothing here says whether anyone commended YOU. That list is private
 * — published, it would be a popularity scoreboard with names on it.
 */
export function CommendPlayers({ postId }: { postId: number }) {
  const [players, setPlayers] = useState<Commendable[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    sessionCommendables(postId).then((rows) => {
      if (live) setPlayers(rows);
    });
    return () => {
      live = false;
    };
  }, [postId]);

  async function give(player: Commendable) {
    if (busy) return;
    setBusy(player.user_id);
    setError(null);

    const { result, error: problem } = await commend(player.user_id, postId);

    setBusy(null);

    if (problem) {
      setError(problem);
      return;
    }

    // 'already' lands here too: the button was pressed twice, or the
    // cooldown was still running. Either way the honest thing to show
    // is that it counts as given.
    if (result) {
      const again = new Date(
        Date.now() + COMMEND_COOLDOWN_DAYS * 86_400_000,
      ).toISOString();
      setPlayers((current) =>
        (current ?? []).map((p) =>
          p.user_id === player.user_id
            ? { ...p, commended: true, available_at: p.available_at ?? again }
            : p,
        ),
      );
    }
  }

  // Nothing to show: not started, you weren't in it, or you were the
  // only one there. The RPC decides; this component doesn't guess.
  if (!players || players.length === 0) return null;

  return (
    <div className="mb-3 notch-md border border-line bg-surface-2 p-2.5">
      <p className="mb-2 label-wide text-muted">
        Good session? Say so
      </p>

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      <div className="flex flex-wrap gap-1.5">
        {players.map((player) => (
          <button
            key={player.user_id}
            type="button"
            onClick={() => give(player)}
            disabled={player.commended || busy === player.user_id}
            title={
              player.commended
                ? `You've commended ${player.display_name || player.username}` +
                  (commendableIn(player.available_at)
                    ? ` — again ${commendableIn(player.available_at)}`
                    : "")
                : `Commend ${player.display_name || player.username}`
            }
            className={
              "flex items-center gap-2 notch-sm border px-2 py-1 text-xs transition " +
              (player.commended
                ? "border-ok/50 bg-ok/10 text-ok"
                : "border-line text-muted hover:border-accent hover:text-accent disabled:opacity-50")
            }
          >
            <Avatar
              of={{
                username: player.username,
                avatar_url: player.avatar_url,
                avatar_preset: player.avatar_preset,
              }}
              size={20}
            />
            <span className="max-w-[9rem] truncate">
              {player.display_name || player.username}
            </span>
            <svg
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill={player.commended ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM7 11l4-8a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.4l-1.4 6A2 2 0 0 1 16.6 20H7" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
