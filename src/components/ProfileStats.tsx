import { useEffect, useRef, useState } from "react";
import {
  getProfileStats,
  joinedMonth,
  membershipLength,
  tally,
  type ProfileStats as Stats,
} from "../lib/stats";

/**
 * The stats panel on a profile.
 *
 * Tiles, not charts. Every figure here is a single number with no
 * shape to it — there is no trend, no composition and no comparison
 * between them, so a chart would be decoration wearing a chart's
 * clothes. Eight of them, because past about eight nobody reads any.
 *
 * The numbers wear text colours, not their own. Colouring each tile
 * differently would imply the colours meant something.
 */
export function ProfileStats({
  userId,
  isSelf,
  refreshKey = 0,
}: {
  userId: string;
  isSelf: boolean;
  /**
   * Bumped by the parent when something elsewhere on the page changed
   * a number this panel shows — adding a game, say. Refetching keeps
   * whatever is on screen until the new data lands, so the panel does
   * not blink back to "Loading…" for a change the person just made.
   */
  refreshKey?: number;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadedOnce = useRef(false);

  useEffect(() => {
    loadedOnce.current = false;
  }, [userId]);

  useEffect(() => {
    let live = true;

    // Spinner on the first load only — see the note in Achievements.
    if (!loadedOnce.current) setLoading(true);

    getProfileStats(userId).then((row) => {
      if (!live) return;
      setStats(row);
      setLoading(false);
      loadedOnce.current = true;
    });

    return () => {
      live = false;
    };
  }, [userId, refreshKey]);

  if (loading || !stats) {
    return (
      <section className="mb-4 notch border border-line bg-surface/85 p-4 backdrop-blur-sm sm:p-5">
        <h2 className="mb-3 label-wide text-muted">Stats</h2>
        <p className="text-sm text-muted">
          {loading ? "Loading…" : "No stats yet."}
        </p>
      </section>
    );
  }

  const tiles: { label: string; value: string; sub?: string }[] = [
    {
      label: "Member for",
      value: membershipLength(stats.days_member),
      sub: `since ${joinedMonth(stats.member_since)}`,
    },
    {
      label: "Sessions joined",
      value: tally(stats.sessions_joined),
    },
    {
      label: "Sessions hosted",
      value: tally(stats.sessions_hosted),
    },
    {
      label: "Played with",
      value: tally(stats.played_with),
      sub: stats.played_with === 1 ? "player" : "players",
    },
    {
      label: "Friends",
      value: tally(stats.friends_now),
      // Only worth saying when it's actually a different number. "5,
      // peak 5" is noise, and on an account that predates the stats
      // going in, the peak is only a floor anyway.
      sub:
        stats.friends_peak > stats.friends_now
          ? `peak ${tally(stats.friends_peak)}`
          : undefined,
    },
    {
      label: "Posts",
      value: tally(stats.posts_made),
    },
    {
      label: "Comments",
      value: tally(stats.comments_made),
    },
    {
      label: "Likes received",
      value: tally(stats.likes_received),
      sub: `${tally(stats.likes_given)} given`,
    },
  ];

  return (
    <section className="mb-4 notch border border-line bg-surface/85 p-4 backdrop-blur-sm sm:p-5">
      <h2 className="mb-3 label-wide text-muted">Stats</h2>

      {/* Two across on a phone. Four would put each tile at about 80px,
          which is not enough for "Sessions hosted" to stay on two
          lines. */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="notch-md border border-line bg-surface-2 px-3 py-2.5"
          >
            <dd className="numeric text-xl font-bold leading-tight">
              {tile.value}
            </dd>
            <dt className="mt-0.5 text-[11px] leading-tight text-muted">
              {tile.label}
            </dt>
            {tile.sub && (
              <p className="mt-0.5 text-[11px] leading-tight text-muted/70">
                {tile.sub}
              </p>
            )}
          </div>
        ))}
      </dl>

      {stats.invites_sent > 0 && (
        <p className="mt-3 text-[11px] text-muted">
          {tally(stats.invites_accepted)} of {tally(stats.invites_sent)} session{" "}
          {stats.invites_sent === 1 ? "invite" : "invites"} accepted.
        </p>
      )}

      {isSelf && stats.days_member < 3 && (
        <p className="mt-3 text-[11px] text-muted">
          Most of these start counting from the day you joined — they'll
          fill in as you use the app.
        </p>
      )}
    </section>
  );
}
