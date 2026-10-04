import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
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
import { engineFor, type ArcadeHandle, type GameState, type RunResult } from "../arcade";
import { Avatar } from "../components/Avatar";
import { SoundToggle } from "../components/SoundToggle";

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
  const game = useRef<ArcadeHandle | null>(null);
  const [state, setState] = useState<GameState>("ready");
  const stateRef = useRef<GameState>("ready");
  stateRef.current = state;
  const [score, setScore] = useState(0);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const [result, setResult] = useState<SubmitResult | string | null>(null);
  const [refresh, setRefresh] = useState(0);
  // Which way to play, for games that offer more than one.
  const [modeId, setModeId] = useState<string | null>(null);
  const mode = info?.modes?.find((m) => m.id === modeId) ?? null;

  const bests = useBests(user?.id, refresh);
  const mine = bests?.find((b) => b.game === slug) ?? null;

  // On a phone a finger over the game hides the game. So on touch
  // screens the whole top of the page — title, canvas and a big pad
  // under it — is the button, and the pad is where a thumb can rest.
  const [touch] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches,
  );

  // Pointer input. A game that aims gets positions relative to its
  // canvas; a one-button game gets press on down and release on up.
  function local(e: PointerEvent) {
    const rect = canvas.current?.getBoundingClientRect();
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 };
  }
  const pressHandlers = {
    onPointerDown: (e: PointerEvent) => {
      e.preventDefault();
      const g = game.current;
      if (!g) return;
      // On a phone the start screen's button is the only way to start,
      // so a touch that was meant to scroll can't launch a run; and a
      // game with modes always starts from its mode buttons.
      if (state === "ready" && (touch || info?.modes)) return;
      if (g.pointer) {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        const p = local(e);
        g.pointer("down", p.x, p.y);
      } else g.press();
    },
    onPointerMove: (e: PointerEvent) => {
      const g = game.current;
      if (!g?.pointer) return;
      const p = local(e);
      g.pointer("move", p.x, p.y);
    },
    onPointerUp: (e: PointerEvent) => {
      const g = game.current;
      if (!g) return;
      if (g.pointer) {
        const p = local(e);
        g.pointer("up", p.x, p.y);
      } else g.release();
    },
    onPointerCancel: (e: PointerEvent) => {
      const g = game.current;
      if (!g) return;
      if (g.pointer) {
        const p = local(e);
        g.pointer("cancel", p.x, p.y);
      } else g.release();
    },
    onPointerLeave: () => {
      const g = game.current;
      if (g && !g.pointer) g.release();
    },
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  };
  // The page-wide tap zone is for one-button games on touch screens.
  const zone = touch && !!info?.touchPad;

  const onRunEnd = useCallback(
    async (run: RunResult) => {
      setLastRun(run);
      setResult(null);
      // A relaxed mode's score is for the player's eyes only.
      if (!info || run.score <= 0 || run.ranked === false) return;
      const r = await submitArcadeScore(info.slug, run.score, run.durationMs);
      setResult(r);
      setRefresh((n) => n + 1);
    },
    [info],
  );

  // Mount the game once per canvas.
  useEffect(() => {
    const el = canvas.current;
    const mount = info ? engineFor(info.slug) : null;
    if (!el || !mount) return;
    setState("ready");
    setScore(0);
    setLastRun(null);
    setResult(null);
    const handle = mount(el, {
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
  // The one button is Space / ↑ / W; a game can claim other keys.
  useEffect(() => {
    const keys = new Set(["Space", "ArrowUp", "KeyW"]);
    function down(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (game.current?.key?.(e.code, true)) {
        e.preventDefault();
        return;
      }
      if (!keys.has(e.code)) return;
      e.preventDefault();
      if (e.repeat) return;
      // Space on the start screen of a game with modes takes the first
      // (ranked) mode, so the keyboard still works end to end.
      if (stateRef.current === "ready" && info?.modes?.length) {
        const first = info.modes[0];
        setModeId(first.id);
        game.current?.setMode?.(first.id);
      }
      game.current?.press();
    }
    function up(e: KeyboardEvent) {
      if (game.current?.key?.(e.code, false)) return;
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

      {/* On touch screens everything from here to the jump pad is one
          tap target (touch-action none so a tap is never a scroll). */}
      <div
        className={zone ? "select-none [touch-action:none]" : undefined}
        {...(zone ? pressHandlers : {})}
      >
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display on-art text-3xl sm:text-4xl">{info.name}</h1>
          <p className="on-art mt-1 text-sm text-muted">{info.tagline}</p>
        </div>
        <div className="flex items-start gap-3">
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
          <SoundToggle className="mt-0.5" />
        </div>
      </header>

      {/* The game. touch-action none so a tap is a tap, not a scroll;
          select-none so a double-tap doesn't highlight the overlay. */}
      {/* On a phone a game that uses the board itself as its control
          leaves a gutter either side (mx-6) so there's always somewhere
          to put a finger that scrolls the page (MARZ, 2026-10-05). */}
      <section
        className={
          "relative select-none overflow-hidden notch border border-line bg-surface [touch-action:none]" +
          (touch && !zone ? " mx-6" : "")
        }
        {...(zone ? {} : pressHandlers)}
        aria-label={`${info.name} game`}
        role="application"
      >
        <canvas ref={canvas} className="block w-full" />

        {info.overlayHud && (
          <div className="pointer-events-none absolute left-4 top-3">
            <p className="label-wide text-muted">Score</p>
            <p className="numeric text-xl font-bold leading-none text-ink">{formatScore(score)}</p>
          </div>
        )}
        {info.overlayHud && mine && (
          <div className="pointer-events-none absolute right-4 top-3 text-right">
            <p className="label-wide text-muted">Best</p>
            <p className="numeric text-xl font-bold leading-none text-muted">{formatScore(mine.best)}</p>
          </div>
        )}

        {state === "ready" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/55 p-4">
            <div className="max-w-sm text-center">
              <p className="display text-2xl text-ink">{info.name}</p>
              <p className="mt-2 text-sm text-ink/90">{info.objective}</p>
              <p className="mt-2 text-xs text-muted">{touch ? info.touchControls : info.controls}</p>
              {/* A real button, so starting is a deliberate tap and not a
                  stray touch while scrolling. It swallows the press so the
                  board underneath doesn't also fire. */}
              {info.modes ? (
                <div className="pointer-events-auto mt-4 grid gap-2 sm:grid-cols-2">
                  {info.modes.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        setModeId(m.id);
                        game.current?.setMode?.(m.id);
                        game.current?.press();
                      }}
                      className={
                        "notch-md border px-4 py-3 text-left transition " +
                        (m.ranked
                          ? "border-accent bg-accent/15 hover:bg-accent/25"
                          : "border-line bg-surface/80 hover:border-accent/60")
                      }
                    >
                      <span className="block text-sm font-semibold text-ink">
                        {m.name}
                        {!m.ranked && <span className="ml-1.5 text-xs font-normal text-muted">· not ranked</span>}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{m.blurb}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => game.current?.press()}
                    className="pointer-events-auto mt-4 notch-md bg-accent px-6 py-2.5 text-sm font-semibold text-onaccent transition hover:bg-accent-hi"
                  >
                    Start
                  </button>
                  {!touch && <p className="mt-2 text-xs text-muted">or press Space</p>}
                </>
              )}
            </div>
          </div>
        )}

        {state === "over" && lastRun && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/55">
            <div className="text-center">
              <p className="label-wide text-danger">{info.slug === "lag-spike" ? "Signal lost" : "Game over"}</p>
              <p className="numeric mt-1 text-4xl font-bold text-ink">{formatScore(lastRun.score)}</p>
              {lastRun.ranked === false ? (
                <p className="mt-1 text-sm text-muted">{mode?.name ?? "Relaxed"} — not on the leaderboards</p>
              ) : newBest ? (
                <p className="mt-1 text-sm font-semibold text-accent">
                  New best! #{formatScore((result as SubmitResult).rank)} of everyone
                </p>
              ) : typeof result === "string" ? (
                <p className="mt-1 text-sm text-muted">Not saved: {result}</p>
              ) : mine ? (
                <p className="mt-1 text-sm text-muted">Best {formatScore(mine.best)}</p>
              ) : null}
              <p className="mt-3 text-sm text-muted">{touch ? "Tap to go again" : "Click or press Space to go again"}</p>
              {info.modes && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    setModeId(null);
                    game.current?.backToStart?.();
                  }}
                  className="pointer-events-auto mt-3 notch-md border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent hover:text-accent"
                >
                  Change mode
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {zone ? (
        <div
          className="mt-3 flex h-28 items-center justify-center notch border border-accent/40 bg-surface-2/80 text-center active:bg-accent/15"
          aria-label={info.touchPad ?? undefined}
          role="button"
        >
          <div>
            <p className="display text-xl text-accent">{info.touchPad}</p>
            <p className="text-xs text-muted">{info.touchControls}</p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-center text-xs text-muted">{touch ? info.touchControls : info.controls}</p>
      )}

      {state === "running" && mode && !mode.ranked && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => game.current?.stop?.()}
            className="notch-md border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent hover:text-accent"
          >
            End run
          </button>
        </div>
      )}
      </div>

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
