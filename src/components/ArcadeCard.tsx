import { Link } from "react-router-dom";
import { formatScore, GAMES, useBests } from "../lib/arcade";

/**
 * A player's arcade bests, on their profile (supabase/93). MARZ:
 * "show user highest score on their profile." One line per game
 * they've played, with their place among everyone. On your own
 * profile the games you haven't tried are listed too, as a nudge;
 * on someone else's the card only appears once they've played.
 */
export function ArcadeCard({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const bests = useBests(userId);
  if (bests === null) return null;
  if (bests.length === 0 && !isSelf) return null;

  const rows = GAMES.map((g) => ({ game: g, best: bests.find((b) => b.game === g.slug) ?? null })).filter(
    (r) => isSelf || r.best,
  );

  return (
    <section className="mb-8">
      <h2 className="on-art mb-4 label-wide text-muted">Arcade</h2>
      <ul className="notch overflow-hidden border border-line bg-surface/85 backdrop-blur-sm">
        {rows.map(({ game, best }) => (
          <li key={game.slug} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{game.name}</p>
              <p className="truncate text-xs text-muted">
                {best
                  ? `#${formatScore(best.rank)} of everyone · ${best.runs} ${best.runs === 1 ? "run" : "runs"}`
                  : "Not played yet"}
              </p>
            </div>
            {best && (
              <p className="numeric shrink-0 text-xl font-bold text-accent">{formatScore(best.best)}</p>
            )}
            <Link
              to={`/arcade/${game.slug}`}
              className="shrink-0 notch-md border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent hover:text-accent"
            >
              {best ? (isSelf ? "Beat it" : "Play") : "Play"}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
