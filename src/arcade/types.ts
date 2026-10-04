/**
 * What every arcade game looks like to the page that hosts it
 * (pages/ArcadeGame.tsx). A game owns its canvas, loop and drawing,
 * and talks back through the three callbacks. Input comes in two
 * shapes: the one-button `press`/`release` (Space, tap) that every
 * game must support, and optional pointer / key hooks for games that
 * aim or steer.
 */

export type GameState = "ready" | "running" | "over";

export type RunResult = {
  score: number;
  /** Wall-clock length of the run, for the plausibility check (93). */
  durationMs: number;
  /** False for a relaxed mode whose score stays on the device and off
   *  the leaderboards. Absent means ranked. */
  ranked?: boolean;
};

export type GameCallbacks = {
  onState: (state: GameState) => void;
  onScore: (score: number) => void;
  onRunEnd: (run: RunResult) => void;
};

export type PointerKind = "down" | "move" | "up" | "cancel";

export type ArcadeHandle = {
  /** The one button: start, act, play again. */
  press(): void;
  release(): void;
  destroy(): void;
  /** Pointer position in CSS pixels relative to the canvas. Games
   *  that aim implement this; the page falls back to press/release
   *  on down/up when it's absent. */
  pointer?(kind: PointerKind, x: number, y: number): void;
  /** Keys beyond the one button. Return true when handled, so the
   *  page can stop the browser scrolling. */
  key?(code: string, down: boolean): boolean;
  /** Games with modes (lib/arcade.ts GAMES[].modes): pick one before
   *  press() starts a run. */
  setMode?(id: string): void;
  /** End the current run on purpose (a mode with no clock). */
  stop?(): void;
  /** Back to the start screen, so another mode can be picked. */
  backToStart?(): void;
};

export type MountGame = (canvas: HTMLCanvasElement, callbacks: GameCallbacks) => ArcadeHandle;
