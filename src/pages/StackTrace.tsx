import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { gameInfo, recordLevelClear, useLevels, type LevelClear } from "../lib/arcade";
import {
  formatTime,
  HINT_PENALTY_MS,
  LAYOUTS,
  LEVEL_COUNT,
  mountStackTrace,
  SHUFFLE_PENALTY_MS,
  type TraceHandle,
} from "../arcade/stackTrace";

const SLUG = "stack-trace";

/**
 * Stack Trace at /arcade/stack-trace — supabase/95, src/arcade/stackTrace.ts.
 *
 * Two screens. The level picker: ten levels, the ones you've cleared
 * with your best time, the next one marked as where you left off,
 * the rest locked. And a level: the board, the clock, Hint and
 * Shuffle (each adds to the clock), and a card when it's clear.
 */
export default function StackTrace() {
  const info = gameInfo(SLUG)!;
  const { user } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const levels = useLevels(user?.id, refresh);
  const [playing, setPlaying] = useState<number | null>(null);

  const cleared = new Map<number, LevelClear>();
  for (const l of levels ?? []) if (l.game === SLUG) cleared.set(l.level, l);
  // Where you left off: the first level without a clear.
  let next = 1;
  while (next <= LEVEL_COUNT && cleared.has(next)) next++;
  const allDone = next > LEVEL_COUNT;

  if (playing !== null) {
    return (
      <Level
        level={playing}
        best={cleared.get(playing)?.best_ms ?? null}
        onExit={() => setPlaying(null)}
        onNext={playing < LEVEL_COUNT ? () => setPlaying(playing + 1) : null}
        onCleared={() => setRefresh((n) => n + 1)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <Link to="/arcade" className="label-wide mb-4 inline-flex items-center gap-1.5 text-muted transition hover:text-ink">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Arcade
      </Link>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display on-art text-3xl sm:text-4xl">{info.name}</h1>
          <p className="on-art mt-1 text-sm text-muted">{info.tagline}</p>
        </div>
        <div className="text-right">
          <p className="label-wide text-muted">Cleared</p>
          <p className="numeric text-2xl font-bold text-accent">
            {levels === null ? "—" : `${cleared.size} / ${LEVEL_COUNT}`}
          </p>
        </div>
      </header>

      {levels !== null && (
        <button
          type="button"
          onClick={() => setPlaying(allDone ? LEVEL_COUNT : next)}
          className="mb-6 flex w-full items-center justify-between gap-4 notch border border-accent/50 bg-accent/10 px-5 py-4 text-left transition hover:bg-accent/15"
        >
          <span>
            <span className="label-wide text-accent">{allDone ? "All clear" : cleared.size ? "Pick up where you left off" : "Start"}</span>
            <span className="mt-0.5 block text-lg font-semibold">
              {allDone ? `Replay level ${LEVEL_COUNT} — ${LAYOUTS[LEVEL_COUNT - 1].name}` : `Level ${next} — ${LAYOUTS[next - 1].name}`}
            </span>
          </span>
          <span className="shrink-0 notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent">
            {allDone ? "Play" : cleared.size ? "Continue" : "Play"}
          </span>
        </button>
      )}

      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1).map((n) => {
          const c = cleared.get(n);
          const locked = levels === null || (!c && n !== next);
          return (
            <li key={n}>
              <button
                type="button"
                disabled={locked}
                onClick={() => setPlaying(n)}
                className={
                  "flex w-full flex-col items-start notch-md border p-3 text-left transition " +
                  (c
                    ? "border-line bg-surface/85 hover:border-accent/60"
                    : n === next && !locked
                      ? "border-accent/60 bg-accent/10 hover:bg-accent/15"
                      : "border-line/60 bg-surface/40 opacity-60")
                }
                title={locked ? "Clear the level before it" : undefined}
              >
                <span className="flex w-full items-center justify-between">
                  <span className="label-wide text-muted">Level {n}</span>
                  {c ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-ok" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Cleared">
                      <path d="m5 12 5 5L20 7" />
                    </svg>
                  ) : locked ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-label="Locked">
                      <rect x="4" y="11" width="16" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  ) : null}
                </span>
                <span className="mt-1 text-sm font-semibold">{LAYOUTS[n - 1].name}</span>
                <span className="numeric mt-1 text-xs text-muted">
                  {c ? `Best ${formatTime(c.best_ms)}` : locked ? "Locked" : "Up next"}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 text-xs text-muted">
        A tile is free when nothing sits on it and one of its long sides is open. Hint adds{" "}
        {HINT_PENALTY_MS / 1000}s to your time, Shuffle adds {SHUFFLE_PENALTY_MS / 1000}s. Every board is dealt
        solvable.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Level({
  level,
  best,
  onExit,
  onNext,
  onCleared,
}: {
  level: number;
  best: number | null;
  onExit: () => void;
  onNext: (() => void) | null;
  onCleared: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<TraceHandle | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [tilesLeft, setTilesLeft] = useState(0);
  const [movesLeft, setMovesLeft] = useState(0);
  const [won, setWon] = useState<{ ms: number; best: number | null; newBest: boolean; problem: string | null } | null>(null);
  const [deal, setDeal] = useState(0);

  const onWin = useCallback(
    async (ms: number) => {
      setWon({ ms, best: null, newBest: false, problem: null });
      const r = await recordLevelClear(SLUG, level, ms);
      if (typeof r === "string") setWon({ ms, best: null, newBest: false, problem: r });
      else setWon({ ms, best: r.best_ms, newBest: r.new_best, problem: null });
      onCleared();
    },
    [level, onCleared],
  );

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    setElapsed(0);
    setWon(null);
    const handle = mountStackTrace(el, level, {
      onTick: setElapsed,
      onBoard: (t, m) => {
        setTilesLeft(t);
        setMovesLeft(m);
      },
      onWin: (ms) => void onWin(ms),
    });
    game.current = handle;
    return () => {
      handle.destroy();
      game.current = null;
    };
  }, [level, deal, onWin]);

  function onPointerDown(e: PointerEvent) {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return;
    game.current?.click(e.clientX - rect.left, e.clientY - rect.top);
  }

  const small =
    "notch-md border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent hover:text-accent disabled:opacity-40";

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={onExit} className="label-wide inline-flex items-center gap-1.5 text-muted transition hover:text-ink">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Levels
        </button>
        <h1 className="display on-art text-xl sm:text-2xl">
          Level {level} <span className="text-muted">— {LAYOUTS[level - 1].name}</span>
        </h1>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-right">
            <p className="label-wide text-muted">Time</p>
            <p className="numeric text-xl font-bold leading-none text-ink">{formatTime(elapsed)}</p>
          </div>
          {best !== null && (
            <div className="hidden text-right sm:block">
              <p className="label-wide text-muted">Best</p>
              <p className="numeric text-xl font-bold leading-none text-muted">{formatTime(best)}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="numeric text-xs text-muted">
          {tilesLeft} tiles · {movesLeft} {movesLeft === 1 ? "move" : "moves"} available
        </span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => game.current?.hint()} disabled={!!won || movesLeft === 0} className={small}>
            Hint +{HINT_PENALTY_MS / 1000}s
          </button>
          <button
            type="button"
            onClick={() => game.current?.shuffle()}
            disabled={!!won}
            className={small + (movesLeft === 0 && !won ? " border-accent text-accent" : "")}
          >
            Shuffle +{SHUFFLE_PENALTY_MS / 1000}s
          </button>
        </div>
      </div>

      {movesLeft === 0 && !won && tilesLeft > 0 && (
        <p className="mb-3 text-sm text-accent">No moves left — shuffle to carry on.</p>
      )}

      {/* Big levels on a phone are wider than the screen; the board
          scrolls sideways inside this frame rather than shrinking the
          tiles past what a finger can hit. */}
      <section
        className="relative select-none notch border border-line bg-surface [touch-action:pan-x_pan-y]"
        onContextMenu={(e) => e.preventDefault()}
        role="application"
        aria-label={`Stack Trace level ${level}`}
      >
        <div className="overflow-x-auto" onPointerDown={onPointerDown}>
          <canvas ref={canvas} className="block" />
        </div>

        {won && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/70 p-4">
            <div className="w-full max-w-sm notch border border-accent/50 bg-surface p-6 text-center">
              <p className="label-wide text-accent">Level {level} clear</p>
              <p className="numeric mt-2 text-4xl font-bold">{formatTime(won.ms)}</p>
              <p className="mt-1 text-sm text-muted">
                {won.problem
                  ? `Not saved: ${won.problem}`
                  : won.best === null
                    ? "Saving…"
                    : won.newBest
                      ? "Your best time for this level."
                      : `Your best is ${formatTime(won.best)}.`}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {onNext && (
                  <button type="button" onClick={onNext} className="notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi">
                    Next level
                  </button>
                )}
                <button type="button" onClick={() => setDeal((n) => n + 1)} className={small}>
                  Play again
                </button>
                <button type="button" onClick={onExit} className={small}>
                  Levels
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <p className="mt-2 text-center text-xs text-muted">
        Tap two free tiles with the same face. Nothing on top, one long side open.
      </p>
    </div>
  );
}
