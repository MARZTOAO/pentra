import { Link } from "react-router-dom";
import { matchReason, lastSeenLabel, type Match } from "../lib/matching";
import { formatLocation } from "../lib/constants";
import { Avatar } from "./Avatar";

/**
 * One player, and why they're worth your time.
 *
 * Lifted out of Discover so the friends list on a profile can show the
 * same thing. Two screens rendering the same match with different
 * wording or a different percentage would make the number look made
 * up — the whole value of a match score is that it means one thing.
 */
export function MatchCard({ match }: { match: Match }) {
  const seen = lastSeenLabel(match.last_seen_at);
  const place = formatLocation(match);

  return (
    <Link
      to={`/u/${match.username}`}
      className="flex gap-4 notch border border-line bg-surface p-4 transition hover:border-accent/50 hover:bg-surface-2"
    >
      <Avatar of={match} size={56} className="shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2">
          <p className="truncate font-semibold">
            {match.display_name || match.username}
          </p>
          <p className="truncate text-xs text-muted">@{match.username}</p>
          {seen === "online now" && (
            <span className="flex items-center gap-1 text-xs text-ok">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              online
            </span>
          )}
        </div>

        {/* The reason. This is the most important text on the card. */}
        <p className="mb-2 text-sm text-accent">{matchReason(match)}</p>

        {match.bio && (
          <p className="mb-2 line-clamp-1 text-sm text-muted">{match.bio}</p>
        )}

        <p className="text-xs text-muted">
          {[place, match.region, seen !== "online now" ? seen : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <MatchScore score={match.score} max={match.max_score} />
    </Link>
  );
}

/**
 * Shown as a percentage rather than raw points, because "68%" needs no
 * explanation and "42 out of 87" needs a paragraph. The raw numbers are
 * still what the ranking sorts on - this is purely how it's presented.
 */
export function MatchScore({ score, max }: { score: number; max: number }) {
  const percent = Math.max(
    0,
    Math.min(100, Math.round((score / Math.max(1, max)) * 100)),
  );

  // Strong matches should feel different at a glance from weak ones.
  const tone =
    percent >= 60
      ? "text-ok"
      : percent >= 30
        ? "text-accent"
        : "text-muted";

  const bar =
    percent >= 60 ? "bg-ok" : percent >= 30 ? "bg-accent" : "bg-muted";

  return (
    <div
      className="flex w-20 shrink-0 flex-col items-end justify-center"
      title={`${Math.round(score)} of a possible ${Math.round(max)} points`}
    >
      {/* Monospaced, not display: this is a number people compare across
          cards, and tabular figures stop it jittering as it changes. */}
      <span className={`numeric text-2xl font-bold ${tone}`}>{percent}%</span>

      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${bar}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <span className="mt-1 text-[10px] uppercase tracking-wide text-muted">
        match
      </span>
    </div>
  );
}
