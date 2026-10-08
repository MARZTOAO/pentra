import { ratingHint, ratingLabel, ratingTier } from "../lib/ratings";
import { LevelBadge } from "./LevelBadge";
import { OgBadge } from "./OgBadge";
import { ProBadge } from "./ProBadge";

/**
 * The badge rail on a profile. Two deliberate rows, every chip the
 * same height (h-6) so the rail reads as one designed thing rather
 * than a pile of stickers (MARZ, 2026-10-08):
 *
 *   row 1 — the numbers: level, standing, commendations. Outlined
 *           chips, same type size.
 *   row 2 — the stamps: Pentra OG and Pro. Filled, uppercase, the
 *           brand marks. Only drawn when there's at least one.
 *
 * Standing is shown at every value including 100, so it reads as a
 * property everybody has rather than a mark that only appears when
 * something is wrong. Colour is not the only signal — the label says
 * the same thing in words, because roughly one man in twelve cannot
 * separate the green from the amber.
 */
export function RatingBadge({
  rating,
  commendations,
  isSelf = false,
  ogNumber = null,
  pro = false,
  userId,
  className = "",
}: {
  rating: number;
  commendations: number;
  isSelf?: boolean;
  /** Pentra OG number, when they have one. Profiles only. */
  ogNumber?: number | null;
  /** Pentra Pro member — see hasPlus() in lib/profile.ts. */
  pro?: boolean;
  /** Pass to include the player level (113) at the front of the rail. */
  userId?: string;
  className?: string;
}) {
  const tier = ratingTier(rating);

  const styles =
    tier === "good"
      ? "border-ok/50 bg-ok/10 text-ok"
      : tier === "watch"
        ? "border-accent/50 bg-accent-dim text-accent"
        : "border-danger/50 bg-danger/10 text-danger";

  return (
    <div className={"flex flex-col gap-1.5 " + className}>
      <div className="flex flex-wrap items-center gap-1.5">
        {userId && <LevelBadge userId={userId} isSelf={isSelf} />}

        <span title={ratingHint(rating, isSelf)} className={"chip border " + styles}>
          {ratingLabel(rating)}
          <span className="numeric opacity-80">{rating}</span>
        </span>

        <span
          title={
            commendations === 1
              ? "Vouched for once by another player"
              : `Vouched for ${commendations} times by other players`
          }
          className="chip border border-line bg-surface-2 text-muted"
        >
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM7 11l4-8a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.4l-1.4 6A2 2 0 0 1 16.6 20H7" />
          </svg>
          <span className="numeric font-semibold text-ink">{commendations}</span>
          commendation{commendations === 1 ? "" : "s"}
        </span>
      </div>

      {(ogNumber != null || pro) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {pro && <ProBadge />}
          {ogNumber != null && <OgBadge number={ogNumber} />}
        </div>
      )}
    </div>
  );
}
