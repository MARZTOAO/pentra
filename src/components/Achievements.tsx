import { useEffect, useMemo, useState } from "react";
import {
  earnedMonth,
  getAchievements,
  isEarned,
  progressRatio,
  type Achievement,
  type AchievementCategory,
} from "../lib/achievements";

/**
 * The badge grid on a profile.
 *
 * Earned ones first, then the handful closest to being earned, then
 * the rest behind a button. Showing all eighteen at once turns a
 * profile into a list of things somebody hasn't done, which is a
 * strange thing to put on a page about them.
 */

/** One shape per category, so the grid reads at a glance. */
function CategoryIcon({ category }: { category: AchievementCategory }) {
  const shared = {
    className: "h-5 w-5",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (category) {
    case "sessions":
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "social":
      return (
        <svg {...shared}>
          <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
          <circle cx="9" cy="7" r="3" />
          <path d="M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a4 4 0 0 1 0 5.8" />
        </svg>
      );
    case "content":
      return (
        <svg {...shared}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
        </svg>
      );
    case "milestone":
      return (
        <svg {...shared}>
          <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6.1L12 16.8 6.7 19.7l1.1-6.1L3.4 9.4l6-.8Z" />
        </svg>
      );
  }
}

function Badge({ item }: { item: Achievement }) {
  const earned = isEarned(item);
  const ratio = progressRatio(item);
  const locked = !earned && item.secret;

  return (
    <div
      className={
        "notch-md border p-3 " +
        (earned
          ? "border-accent/40 bg-accent/5"
          : "border-line bg-surface-2/60")
      }
    >
      <div className={earned ? "text-accent" : "text-muted/50"}>
        {locked ? (
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        ) : (
          <CategoryIcon category={item.category} />
        )}
      </div>

      <p
        className={
          "mt-2 text-sm font-semibold leading-tight " +
          (earned ? "" : "text-muted")
        }
      >
        {locked ? "Secret" : item.name}
      </p>

      <p className="mt-0.5 text-[11px] leading-snug text-muted">
        {locked ? "Earn it to find out." : item.description}
      </p>

      {earned && item.earned_at && (
        <p className="numeric mt-1.5 text-[11px] text-accent/80">
          {earnedMonth(item.earned_at)}
        </p>
      )}

      {/* Only where there is something to measure. A bar at 0% on
          "filled a session" would suggest it was a journey. */}
      {!earned && ratio !== null && (
        <div className="mt-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-muted/60"
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </div>
          <p className="numeric mt-1 text-[11px] text-muted">
            {item.progress} / {item.threshold}
          </p>
        </div>
      )}
    </div>
  );
}

export function Achievements({
  userId,
  isSelf,
}: {
  userId: string;
  isSelf: boolean;
}) {
  const [items, setItems] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;

    setLoading(true);
    setShowAll(false);
    getAchievements(userId).then((rows) => {
      if (!live) return;
      setItems(rows);
      setLoading(false);
    });

    return () => {
      live = false;
    };
  }, [userId]);

  const { earned, nearly, rest } = useMemo(() => {
    const got = items.filter(isEarned);
    const notYet = items.filter((a) => !isEarned(a));

    // The six closest to being earned. Something with 9 of 10 is
    // worth showing; something with 0 of 1,000 is a list of homework,
    // and with forty in the catalogue most of them are that.
    const ranked = [...notYet].sort(
      (a, b) => (progressRatio(b) ?? 0) - (progressRatio(a) ?? 0),
    );
    const close = ranked.filter((a) => (progressRatio(a) ?? 0) > 0).slice(0, 6);

    return {
      earned: got,
      nearly: close,
      rest: notYet.filter((a) => !close.includes(a)),
    };
  }, [items]);

  if (loading) {
    return (
      <section className="mb-4 notch border border-line bg-surface/85 p-4 backdrop-blur-sm sm:p-5">
        <h2 className="mb-3 label-wide text-muted">Achievements</h2>
        <p className="text-sm text-muted">Loading…</p>
      </section>
    );
  }

  const shown = showAll ? [...earned, ...nearly, ...rest] : [...earned, ...nearly];

  return (
    <section className="mb-4 notch border border-line bg-surface/85 p-4 backdrop-blur-sm sm:p-5">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="label-wide text-muted">Achievements</h2>
        <span className="numeric text-[11px] text-muted">
          {earned.length}/{items.length}
        </span>
      </div>

      {earned.length === 0 && nearly.length === 0 ? (
        <p className="text-sm text-muted">
          {isSelf
            ? "None yet — join a session or make a post and the first few come quickly."
            : "None yet."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map((item) => (
            <Badge key={item.code} item={item} />
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 label-wide text-muted transition hover:text-accent"
        >
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}
