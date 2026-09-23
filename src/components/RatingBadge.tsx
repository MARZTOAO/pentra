import { ratingHint, ratingLabel, ratingTier } from "../lib/ratings";

/**
 * Standing and commendations, side by side on a profile.
 *
 * The badge is shown at every value including 100, so it reads as a
 * property everybody has rather than a mark that only appears when
 * something is wrong. A badge that only showed up after a penalty
 * would be a scarlet letter.
 *
 * Colour is not the only signal — the label says the same thing in
 * words, because roughly one man in twelve cannot separate the green
 * from the amber.
 */
export function RatingBadge({
  rating,
  commendations,
  isSelf = false,
  className = "",
}: {
  rating: number;
  commendations: number;
  isSelf?: boolean;
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
    <div className={"flex flex-wrap items-center gap-2 " + className}>
      <span
        title={ratingHint(rating, isSelf)}
        className={"notch-sm border px-2 py-0.5 text-xs font-semibold " + styles}
      >
        {ratingLabel(rating)}
        <span className="numeric ml-1.5 opacity-80">{rating}</span>
      </span>

      <span
        title={
          commendations === 1
            ? "Vouched for once by another player"
            : `Vouched for ${commendations} times by other players`
        }
        className="notch-sm border border-line bg-surface-2 px-2 py-0.5 text-xs text-muted"
      >
        <svg
          className="mr-1 inline h-3 w-3 align-[-1px]"
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
        <span className="ml-1">
          commendation{commendations === 1 ? "" : "s"}
        </span>
      </span>
    </div>
  );
}
