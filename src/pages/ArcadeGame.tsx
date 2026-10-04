import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import {
  formatScore,
  gameInfo,
  getLeaderboard,
  submitArcadeScore,
  useBests,
  type BoardRow,
  type BoardScope,
  type SubmitResult,
} from "../lib/arcade";
import { mountLagSpike, type GameState, type LagSpikeHandle, type RunResult } from "../arcade/lagSpike";
import { Avatar } from "../components/Avatar";

/**
 * One arcade game at /arcade/:slug — supabase/93, src/arcade/.
 *
 * The canvas is the game; everything written on top of it (score,
 * the start and game-over screens) is ordinary HTML so it uses the
 * app's fonts. One input — Space, ↑, W or a tap on the game — does
 * everything: start, jump, play again. A finished run goes to the
 * database, which answers with the player's best and their place,
 * and the leaderboards below refresh.
 */
export default function ArcadeGame() {
  const { slug } = useParams();
  const info = gameInfo(slug);
  const { user } = useAuth();

  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<LagSpikeHandle | null>(null);
  const [state, setState] = useState<GameState>("ready");
  const [score, setScore] = useState(0);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const [result, setResult] = useState<SubmitResult | string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const bests = useBests(user?.id, refresh);
  const mine = bests?.find((b) => b.game === slug) ?? null;

  const onRunEnd = useCallback(
    async (run: RunResult) => {
      setLastRun(run);
      setResult(null);
      if (!info || run.score <= 0) return;
      const r = await submitArcadeScore(info.slug, run.score, run.durationMs);
      setResult(r);
      setRefresh((n) => n + 1);
    },
    [info],
  );

  // Mount the game once per canvas.
  useEffect(() => {
    const el = canvas.current;
    if (!el || !info) return;
    const handle = mountLagSpike(el, {
      onState: setState,
      onScore: setScore,
      onRunEnd: (run) => void onRunEnd(run),
    });
    game.current = handle;
    return () => {
      handle.destroy();
      game.current = null;
    };
  }, [info, onRunEnd]);

  // Keyboard, for the whole page: Space would otherwise scroll it.
  useEffect(() => {
    const keys = new Set(["Space", "ArrowUp", "KeyW"]);
    function down(e: KeyboardEvent) {
      if (!keys.has(e.code)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      if (!e.repeat) game.current?.press();
    }
    function up(e: KeyboardEvent) {
      if (keys.has(e.code)) game.current?.release();
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  if (!info) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <h1 className="display mb-2 text-2xl">No such game</h1>
          <Link to="/arcade" className="text-sm text-accent underline underline-offset-2">
            Back to the Arcade
          </Link>
        </div>
      </div>
    );
  }

  const newBest = typeof result === "object" && result !== null && result.new_best;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <Link to="/arcade" className="label-wide mb-4 inline-flex items-center gap-1.5 text-muted transition hover:text-ink">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Arcade
      </Link>

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display on-art text-3xl sm:text-4xl">{info.name}</h1>
          <p className="on-art mt-1 text-sm text-muted">{info.tagline}</p>
        </div>
        <div className="text-right">
          <p className="label-wide text-muted">Your best</p>
          <p className="numeric text-2xl font-bold text-accent">
            {mine ? formatScore(mine.best) : "—"}
          </p>
          {mine && (
            <p className="text-xs text-muted">
              #{formatScore(mine.rank)} of everyone · {mine.runs} {mine.runs === 1 ? "run" : "runs"}
            </p>
          )}
        </div>
      </header>

      {/* The game. touch-action none so a tap is a tap, not a scroll;
          select-none so a double-tap doesn't highlight the overlay. */}
      <section
        className="relative select-none overflow-hidden notch border border-line bg-surface [touch-action:none]"
        onPointerDown={(e) => {
          e.preventDefault();
          game.current?.press();
        }}
        onPointerUp={() => game.current?.release()}
        onPointerCancel={() => game.current?.release()}
        onPointerLeave={() => game.current?.release()}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={`${info.name} game`}
        role="application"
      >
        <canvas ref={canvas} className="block w-full" />

        <div className="pointer-events-none absolute left-4 top-3">
          <p className="label-wide text-muted">Score</p>
          <p className="numeric text-xl font-bold leading-none text-ink">{formatScore(score)}</p>
        </div>
        {mine && (
          <div className="pointer-events-none absolute right-4 top-3 text-right">
            <p className="label-wide text-muted">Best</p>
            <p className="numeric text-xl font-bold leading-none text-muted">{formatScore(mine.best)}</p>
          </div>
        )}

        {state === "ready" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="display text-2xl text-ink">Ready?</p>
              <p className="mt-1 text-sm text-muted">
                <span className="hidden sm:inline">Press Space or tap to start</span>
                <span className="sm:hidden">Tap to start</span>
              </p>
            </div>
          </div>
        )}

        {state === "over" && lastRun && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/55">
            <div className="text-center">
              <p className="label-wide text-danger">Signal lost</p>
              <p className="numeric mt-1 text-4xl font-bold text-ink">{formatScore(lastRun.score)}</p>
              {newBest ? (
                <p className="mt-1 text-sm font-semibold text-accent">
                  New best! #{formatScore((result as SubmitResult).rank)} of everyone
                </p>
              ) : typeof result === "string" ? (
                <p className="mt-1 text-sm text-muted">Not saved: {result}</p>
              ) : mine ? (
                <p className="mt-1 text-sm text-muted">Best {formatScore(mine.best)}</p>
              ) : null}
              <p className="mt-3 text-sm text-muted">
                <span className="hidden sm:inline">Space or tap to go again</span>
                <span className="sm:hidden">Tap to go again</span>
              </p>
            </div>
          </div>
        )}
      </section>

      <p className="mt-2 text-center text-xs text-muted">{info.controls}</p>

      <Leaderboards game={info.slug} refreshKey={refresh} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Leaderboards({ game, refreshKey }: { game: string; refreshKey: number }) {
  const [scope, setScope] = useState<BoardScope>("friends");
  const [rows, setRows] = useState<BoardRow[] | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    getLeaderboard(game, scope).then((r) => {
      if (live) setRows(r);
    });
    return () => {
      live = false;
    };
  }, [game, scope, refreshKey]);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-1 border-b border-line/70">
        {(
          [
            ["friends", "Friends"],
            ["global", "Everyone"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScope(key)}
            aria-current={scope === key ? "page" : undefined}
            className={
              "on-art -mb-px border-b-2 px-3 py-2 text-sm font-semibold transition " +
              (scope === key ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink")
            }
          >
            {label}
          </button>
        ))}
        <span className="label-wide ml-auto text-muted">Top 10</span>
      </div>

      {rows === null ? (
        <p className="on-art text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="notch border border-dashed border-line bg-surface/60 p-6 text-center backdrop-blur-sm">
          <p className="text-sm text-muted">
            {scope === "friends"
              ? "None of your friends have played yet. Be the first — then send them here."
              : "Nobody has played yet. The top spot is yours for the taking."}
          </p>
        </div>
      ) : (
        <ol className="notch overflow-hidden border border-line bg-surface/85 backdrop-blur-sm">
          {rows.map((row) => (
            <li
              key={row.user_id}
              className={
                "flex items-center gap-3 border-b border-line/60 px-3 py-2 last:border-b-0 " +
                (row.is_me ? "bg-accent/10" : "")
              }
            >
              <span
                className={
                  "numeric w-7 shrink-0 text-right text-sm font-bold " +
                  (row.rank === 1 ? "text-accent" : "text-muted")
                }
              >
                {row.rank}
              </span>
              <Link to={`/u/${row.username}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                <Avatar of={row} size={28} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {row.display_name || row.username}
                    {row.is_me && <span className="ml-1.5 text-xs font-normal text-accent">you</span>}
                  </span>
                  <span className="block truncate text-xs text-muted">@{row.username}</span>
                </span>
              </Link>
              <span className="numeric shrink-0 text-base font-bold">{formatScore(row.best)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
