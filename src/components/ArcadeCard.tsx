import { Link } from "react-router-dom";
import { formatScore, GAMES, useBests, useLevels } from "../lib/arcade";
import { LEVEL_COUNT, formatTime, levelLabel } from "../arcade/stackTrace";

/**
 * A player's arcade bests, on their profile (supabase/93). MARZ:
 * "show user highest score on their profile." One line per game
 * they've played, with their place among everyone. On your own
 * profile the games you haven't tried are listed too, as a nudge;
 * on someone else's the card only appears once they've played.
 */
export function ArcadeCard({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const bests = useBests(userId);
  const levels = useLevels(userId);
  if (bests === null || levels === null) return null;

  // Chess has no score or levels; its record lives on the Arcade page.
  const rows = GAMES.filter((g) => g.kind !== "chess").map((g) => {
    const cleared = levels.filter((l) => l.game === g.slug);
    const totalMs = cleared.reduce((n, l) => n + l.best_ms, 0);
    return {
      game: g,
      best: bests.find((b) => b.game === g.slug) ?? null,
      cleared: cleared.length,
      totalMs,
      times: [...cleared].sort((a, b) => a.level - b.level),
    };
  }).filter((r) => isSelf || r.best || r.cleared > 0);
  if (rows.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="on-art mb-4 label-wide text-muted">Arcade</h2>
      <ul className="notch overflow-hidden border border-line bg-surface/85 backdrop-blur-sm">
        {rows.map(({ game, best, cleared, totalMs, times }) => (
          <li key={game.slug} className="flex flex-wrap items-center gap-3 border-b border-line/60 px-4 py-3 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{game.name}</p>
              <p className="truncate text-xs text-muted">
                {game.kind === "levels"
                  ? cleared > 0
                    ? `${cleared} of ${LEVEL_COUNT} levels · best times total ${formatTime(totalMs)}`
                    : "Not played yet"
                  : best
                    ? `#${formatScore(best.rank)} of everyone · ${best.runs} ${best.runs === 1 ? "run" : "runs"}`
                    : "Not played yet"}
              </p>
            </div>
            {game.kind === "levels" ? (
              cleared > 0 && (
                <p className="numeric shrink-0 text-xl font-bold text-accent">
                  {cleared}
                  <span className="text-sm text-muted">/{LEVEL_COUNT}</span>
                </p>
              )
            ) : (
              best && <p className="numeric shrink-0 text-xl font-bold text-accent">{formatScore(best.best)}</p>
            )}
            <Link
              to={`/arcade/${game.slug}`}
              className="shrink-0 notch-md border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent hover:text-accent"
            >
              {game.kind === "levels"
                ? cleared >= LEVEL_COUNT
                  ? "Replay"
                  : cleared > 0 && isSelf
                    ? "Continue"
                    : "Play"
                : best
                  ? isSelf
                    ? "Beat it"
                    : "Play"
                  : "Play"}
            </Link>
            {/* Levels games: the time for each level cleared (MARZ:
                "see the levels they've beat and the time each one took"). */}
            {game.kind === "levels" && times.length > 0 && (
              <ul className="flex w-full flex-wrap gap-1.5">
                {times.map((t) => (
                  <li key={t.level} className="numeric notch-sm border border-line/70 bg-surface-2/60 px-2 py-0.5 text-2xs text-muted">
                    <span className="text-ink">{levelLabel(t.level)}</span> {formatTime(t.best_ms)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
