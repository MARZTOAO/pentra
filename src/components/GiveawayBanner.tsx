import { Link } from "react-router-dom";
import { timeLeft, useCurrentGiveaway } from "../lib/giveaway";

/**
 * Top of Home while a giveaway is taking entries (supabase/105).
 * Draws nothing the rest of the time.
 */
export function GiveawayBanner() {
  const g = useCurrentGiveaway();
  if (!g || !g.open) return null;

  return (
    <Link
      to="/giveaway"
      className="mb-4 flex items-center gap-3 notch border border-accent/60 bg-accent/10 px-4 py-3 backdrop-blur-sm transition hover:bg-accent/15"
    >
      <span className="label-wide shrink-0 text-accent">Giveaway</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.title}</span>
      <span className="numeric hidden shrink-0 text-xs text-muted sm:inline">{timeLeft(g.ends_at)}</span>
      <span className="shrink-0 text-sm font-semibold text-accent">Enter →</span>
    </Link>
  );
}
