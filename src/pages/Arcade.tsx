import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { GAMES, formatScore, useBests } from "../lib/arcade";

/**
 * The Arcade tab — /arcade. Small games inside Pentra (supabase/93).
 * One so far; the grid is here so the next ones have somewhere to go.
 */
export default function Arcade() {
  const { user } = useAuth();
  const bests = useBests(user?.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="display on-art text-2xl sm:text-3xl">Arcade</h1>
        <p className="on-art mt-1 text-sm text-muted">
          Quick games between sessions. Your best score goes on your profile.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {GAMES.map((g) => {
          const mine = bests?.find((b) => b.game === g.slug) ?? null;
          return (
            <Link
              key={g.slug}
              to={`/arcade/${g.slug}`}
              className="group notch border border-line bg-surface/85 p-5 backdrop-blur-sm transition hover:border-accent/60"
            >
              <div className="mb-4 flex h-28 items-center justify-center overflow-hidden notch-md bg-bg">
                <Preview slug={g.slug} />
              </div>
              <h2 className="display text-xl">{g.name}</h2>
              <p className="mt-1 text-sm text-muted">{g.tagline}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted">
                  {mine ? (
                    <>
                      Your best <span className="numeric font-bold text-ink">{formatScore(mine.best)}</span>
                      {" · "}#{formatScore(mine.rank)}
                    </>
                  ) : (
                    "Not played yet"
                  )}
                </span>
                <span className="notch-md bg-accent px-3 py-1.5 text-xs font-semibold text-onaccent transition group-hover:bg-accent-hi">
                  Play
                </span>
              </div>
            </Link>
          );
        })}

        <div className="flex items-center justify-center notch border border-dashed border-line/70 p-5 text-center">
          <p className="text-sm text-muted">More games are on the way.</p>
        </div>
      </div>
    </div>
  );
}

/** A still of the game for its card, drawn in SVG so it's crisp at any size. */
function Preview({ slug }: { slug: string }) {
  if (slug !== "lag-spike") return null;
  return (
    <svg viewBox="0 0 240 90" className="h-full w-full" aria-hidden="true">
      <g stroke="rgba(141,147,156,0.12)" strokeWidth="1">
        {[20, 60, 100, 140, 180, 220].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="70" />
        ))}
        <line x1="0" y1="30" x2="240" y2="30" />
      </g>
      <line x1="0" y1="71" x2="240" y2="71" stroke="#3a3f48" strokeWidth="2" />
      <polygon points="150,71 156,48 162,71" fill="#ff6b6b" opacity="0.9" />
      <polygon points="166,71 172,42 178,71" fill="#ff6b6b" opacity="0.9" />
      <polygon points="218,71 224,52 230,71" fill="#ff6b6b" opacity="0.9" />
      <g opacity="0.25" fill="#ff7a2f">
        <polygon points="38,46 46,52 43,61 33,61 30,52" />
        <polygon points="26,49 32,54 30,61 22,61 20,54" />
      </g>
      <polygon
        points="60,34 71,42 67,55 53,55 49,42"
        fill="#ff7a2f"
        style={{ filter: "drop-shadow(0 0 6px rgba(255,122,47,0.8))" }}
      />
      <polygon points="60,41 64,44 63,48 57,48 56,44" fill="#ff9354" />
    </svg>
  );
}
