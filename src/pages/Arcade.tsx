import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { GAMES, formatScore, useBests, useLevels } from "../lib/arcade";
import { LEVEL_COUNT } from "../arcade/stackTrace";
import { useEffect, useState } from "react";
import { getChessRecord, type ChessRecord } from "../lib/chess";

/**
 * The Arcade tab — /arcade. Small games inside Pentra (supabase/93).
 * One so far; the grid is here so the next ones have somewhere to go.
 */
export default function Arcade() {
  const { user } = useAuth();
  const bests = useBests(user?.id);
  const levels = useLevels(user?.id);
  const [chess, setChess] = useState<ChessRecord | null>(null);
  useEffect(() => {
    getChessRecord().then(setChess);
  }, []);

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
          const done = levels?.filter((l) => l.game === g.slug).length ?? 0;
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
                  {g.kind === "chess" ? (
                    chess && chess.wins + chess.losses + chess.draws > 0 ? (
                      <>
                        Against players{" "}
                        <span className="numeric font-bold text-ink">
                          {chess.wins}–{chess.losses}–{chess.draws}
                        </span>
                      </>
                    ) : (
                      "Computer or a friend"
                    )
                  ) : g.kind === "levels" ? (
                    done > 0 ? (
                      <>
                        <span className="numeric font-bold text-ink">{done}</span> of {LEVEL_COUNT} levels cleared
                      </>
                    ) : (
                      "Not played yet"
                    )
                  ) : mine ? (
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

/** A still of each game for its card, drawn in SVG so it's crisp at any size. */
function Preview({ slug }: { slug: string }) {
  if (slug === "hot-swap") {
    const cols = ["#ff7a2f", "#e9ebee", "#a66cff", "#2ad4c8", "#8bff3a", "#ff4fa3"];
    const grid = [
      [0, 1, 2, 3, 4, 5, 0, 1],
      [2, 2, 2, 5, 1, 0, 3, 4],
      [4, 3, 0, 1, 5, 5, 5, 2],
      [1, 0, 4, 2, 3, 1, 0, 3],
    ];
    return (
      <svg viewBox="0 0 240 90" className="h-full w-full" aria-hidden="true">
        {grid.map((row, r) =>
          row.map((t, c) => (
            <g key={`${r}-${c}`} transform={`translate(${30 + c * 26},${12 + r * 22})`}>
              {r === 1 && c <= 2 && <rect x="-12" y="-10" width="24" height="20" fill="rgba(255,122,47,0.18)" />}
              <circle r="8" fill={cols[t]} stroke="rgba(14,15,17,0.6)" strokeWidth="1.5" />
            </g>
          )),
        )}
      </svg>
    );
  }
  if (slug === "stack-trace") {
    const tiles: [number, number, number, string][] = [
      [40, 20, 0, "#ff7a2f"], [70, 20, 0, "#e9ebee"], [100, 20, 0, "#a66cff"], [130, 20, 0, "#2ad4c8"], [160, 20, 0, "#8bff3a"],
      [40, 50, 0, "#2ad4c8"], [70, 50, 0, "#8bff3a"], [160, 50, 0, "#ff7a2f"],
      [85, 35, 1, "#ff7a2f"], [115, 35, 1, "#e9ebee"],
      [100, 27, 2, "#a66cff"],
    ];
    return (
      <svg viewBox="0 0 240 90" className="h-full w-full" aria-hidden="true">
        {tiles.map(([x, y, z, c], i) => (
          <g key={i} transform={`translate(${x - z * 3},${y - z * 3})`}>
            <rect x="3" y="3" width="26" height="30" rx="3" fill="#0e0f11" />
            <rect x="0" y="0" width="26" height="30" rx="3" fill="#23262c" stroke="rgba(233,235,238,0.22)" />
            <circle cx="13" cy="15" r="6" fill={c} />
          </g>
        ))}
      </svg>
    );
  }
  if (slug === "packet-pop") {
    const colors = ["#ff7a2f", "#e9ebee", "#a66cff", "#2ad4c8", "#8bff3a"];
    const rows = [
      [0, 1, 2, 3, 4, 0, 1, 2, 3],
      [2, 2, 4, 1, 1, 3, 0, 4],
      [4, 0, 3, 3, 2, 1, 1, 0, 4],
    ];
    return (
      <svg viewBox="0 0 240 90" className="h-full w-full" aria-hidden="true">
        {rows.map((row, ri) =>
          row.map((ci, i) => (
            <circle
              key={`${ri}-${i}`}
              cx={16 + i * 26 + (ri % 2 ? 13 : 0)}
              cy={12 + ri * 22}
              r="11"
              fill={colors[ci]}
              stroke="rgba(14,15,17,0.6)"
              strokeWidth="1.5"
            />
          )),
        )}
        <line x1="120" y1="84" x2="150" y2="62" stroke="rgba(233,235,238,0.5)" strokeDasharray="2 4" />
        <circle cx="120" cy="84" r="11" fill="#ff7a2f" stroke="rgba(14,15,17,0.6)" strokeWidth="1.5" />
      </svg>
    );
  }
  if (slug === "chess") {
    const pieces = ["♜", "♞", "♝", "♛", "♚", "♝", "♞", "♜"];
    return (
      <svg viewBox="0 0 240 90" className="h-full w-full" aria-hidden="true">
        {[...Array(32).keys()].map((i) => {
          const r = Math.floor(i / 8), c = i % 8;
          return (
            <rect key={i} x={48 + c * 18} y={9 + r * 18} width="18" height="18"
              fill={(r + c) % 2 === 0 ? "#c9c3b4" : "#6b5d4a"} />
          );
        })}
        {pieces.map((p, c) => (
          <text key={c} x={57 + c * 18} y={23} textAnchor="middle" fontSize="15" fill="#15161a">{p}</text>
        ))}
        {pieces.map((_, c) => (
          <text key={`p${c}`} x={57 + c * 18} y={41} textAnchor="middle" fontSize="15" fill="#15161a">♟</text>
        ))}
        {[2, 5].map((c) => (
          <text key={`w${c}`} x={57 + c * 18} y={77} textAnchor="middle" fontSize="15" fill="#f6f1e6">♙</text>
        ))}
        <text x={57 + 4 * 18} y={59} textAnchor="middle" fontSize="15" fill="#f6f1e6">♙</text>
      </svg>
    );
  }
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
