import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getMatchWith,
  matchReason,
  sharesAnything,
  type MatchWith,
} from "../lib/matching";
import { MatchScore } from "./MatchCard";

/**
 * How well you match the person whose profile you're on.
 *
 * Discover shows a percentage and so does a friends list. The profile
 * was the one place it went missing, which is backwards — the profile
 * is where the decision actually gets made.
 *
 * It's the same number, from the same expression in the database, so
 * 71% on Discover is 71% here. See supabase/55_match_with.sql.
 *
 * NOTHING IS CACHED. This refetches on every view, because the number
 * is supposed to move: it's built from both Top 5s, both libraries,
 * platforms, when you're each online and how recently they played. A
 * 90% match today won't be one in two years — the games it's counting
 * haven't come out yet. So the line underneath says so plainly, rather
 * than letting the number read as a verdict on two people.
 */
export function ProfileMatch({ userId }: { userId: string }) {
  const [match, setMatch] = useState<MatchWith | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    getMatchWith(userId).then((result) => {
      if (!active) return;
      setMatch(result);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  // No row means there's nothing to say — yourself, or somebody
  // blocked. Drawing an empty panel would be worse than drawing none.
  if (loading || !match) return null;

  return (
    <section className="mb-8 notch border border-line bg-surface/85 p-4 backdrop-blur-sm sm:p-5">
      {!match.you_ready ? (
        <Prompt
          headline="Add some games and you'll see how well you two match."
          detail="The score is mostly built out of your Top 5 and your library. With neither, there's nothing to compare against."
          cta="Set up your profile"
        />
      ) : !match.they_ready ? (
        <Prompt
          headline="Not enough on their profile to compare yet."
          detail="They haven't picked a Top 5 or added any games. That's an unknown rather than a bad match — check back once they have."
        />
      ) : (
        <div className="flex items-start gap-4 sm:gap-5">
          <MatchScore score={match.score} max={match.max_score} />

          <div className="min-w-0 flex-1">
            {sharesAnything(match) ? (
              <p className="mb-1.5 break-words text-sm font-medium text-accent">
                {matchReason(match)}
              </p>
            ) : (
              <p className="mb-1.5 text-sm font-medium text-muted">
                No games, platforms or hours in common yet.
              </p>
            )}

            {/* The number is a snapshot, and saying so is the
                difference between a useful signal and a verdict on two
                people. */}
            <p className="text-xs leading-relaxed text-muted">
              Worked out fresh each time from both your Top 5s,
              libraries, platforms and when you're each around. It moves
              as either of you does.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function Prompt({
  headline,
  detail,
  cta,
}: {
  headline: string;
  detail: string;
  cta?: string;
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{headline}</p>
      <p className="text-xs leading-relaxed text-muted">{detail}</p>
      {cta && (
        <Link
          to="/me"
          className="mt-3 inline-block notch-md border border-accent/50 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/10"
        >
          {cta}
        </Link>
      )}
    </div>
  );
}
