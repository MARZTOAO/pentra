import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * The Arcade — supabase/93_arcade.sql.
 *
 * The games live in src/arcade/. This file is the list of them and
 * the calls that record scores and read leaderboards. Adding a game:
 * a row in arcade_games (a migration), an entry in GAMES below, and
 * an engine registered in src/arcade/index.ts.
 */

export type ArcadeGameInfo = {
  slug: string;
  name: string;
  tagline: string;
  /** "score": one run, one number, leaderboards (ArcadeGame.tsx).
   *  "levels": progress through levels with a time each, no boards
   *  (its own page). */
  kind: "score" | "levels";
  /** How to play, in one line. */
  controls: string;
  /** The same line for a phone. */
  touchControls: string;
  /** On touch screens the page adds a big pad under the canvas so a
   *  thumb never covers the game; this is the word on it. Null: no pad. */
  touchPad: string | null;
  /** Draw the score/best in HTML over the canvas. Games that draw
   *  their own HUD (and use the top of the canvas) turn this off. */
  overlayHud: boolean;
};

export const GAMES: ArcadeGameInfo[] = [
  {
    slug: "lag-spike",
    name: "Lag Spike",
    kind: "score",
    tagline: "Keep the signal running. Jump the spikes. It only gets faster.",
    controls: "Space, ↑ or tap to jump. Hold for a higher jump.",
    touchControls: "Tap anywhere up here to jump. Hold for a higher jump.",
    touchPad: "JUMP",
    overlayHud: true,
  },
  {
    slug: "packet-pop",
    name: "Packet Pop",
    kind: "score",
    tagline: "Match three to pop. Drop what's left hanging. New rows keep coming.",
    controls: "Move the mouse to aim, click or Space to fire. ← → also aim.",
    touchControls: "Drag left or right anywhere to aim. Tap to fire.",
    touchPad: "AIM",
    overlayHud: false,
  },
  {
    slug: "stack-trace",
    name: "Stack Trace",
    kind: "levels",
    tagline: "Clear the stack, one matching pair at a time. Ten levels. No clock but your own.",
    controls: "Click two free tiles with the same face.",
    touchControls: "Tap two free tiles with the same face.",
    touchPad: null,
    overlayHud: false,
  },
];

export function gameInfo(slug: string | undefined): ArcadeGameInfo | null {
  return GAMES.find((g) => g.slug === slug) ?? null;
}

export type SubmitResult = {
  best: number;
  new_best: boolean;
  rank: number;
};

/**
 * Record a finished run. Returns the player's best after it and
 * whether this run set it, or a sentence if the database refused
 * (an impossible score, or signed out).
 */
export async function submitArcadeScore(
  game: string,
  score: number,
  durationMs: number,
): Promise<SubmitResult | string> {
  const { data, error } = await supabase.rpc("submit_arcade_score", {
    game,
    score: Math.max(0, Math.floor(score)),
    duration_ms: Math.max(0, Math.round(durationMs)),
  });
  if (error) return error.message;
  const row = (Array.isArray(data) ? data[0] : data) as SubmitResult | undefined;
  if (!row) return "No reply.";
  return { best: row.best, new_best: row.new_best, rank: Number(row.rank) };
}

export type BoardRow = {
  rank: number;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  best: number;
  best_at: string;
  is_me: boolean;
};

export type BoardScope = "friends" | "global";

export async function getLeaderboard(game: string, scope: BoardScope, max = 10): Promise<BoardRow[]> {
  const { data, error } = await supabase.rpc("arcade_leaderboard", {
    game,
    scope,
    max_results: max,
  });
  if (error || !data) return [];
  return (data as BoardRow[]).map((r) => ({ ...r, rank: Number(r.rank) }));
}

export type Best = {
  game: string;
  name: string;
  best: number;
  best_at: string;
  runs: number;
  rank: number;
};

export async function getBests(userId: string): Promise<Best[]> {
  const { data, error } = await supabase.rpc("arcade_bests", { who: userId });
  if (error || !data) return [];
  return (data as Best[]).map((r) => ({ ...r, rank: Number(r.rank) }));
}

/** A player's bests, refetched when `refreshKey` changes. */
export function useBests(userId: string | undefined, refreshKey = 0) {
  const [bests, setBests] = useState<Best[] | null>(null);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    getBests(userId).then((rows) => {
      if (live) setBests(rows);
    });
    return () => {
      live = false;
    };
  }, [userId, refreshKey]);
  return bests;
}

/* ---- level games (95) -------------------------------------------- */

export type LevelClear = {
  game: string;
  level: number;
  best_ms: number;
  clears: number;
  last_cleared_at: string;
};

export async function getLevels(userId: string): Promise<LevelClear[]> {
  const { data, error } = await supabase.rpc("arcade_levels_of", { who: userId });
  if (error || !data) return [];
  return data as LevelClear[];
}

/** A player's cleared levels, refetched when `refreshKey` changes. */
export function useLevels(userId: string | undefined, refreshKey = 0) {
  const [levels, setLevels] = useState<LevelClear[] | null>(null);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    getLevels(userId).then((rows) => {
      if (live) setLevels(rows);
    });
    return () => {
      live = false;
    };
  }, [userId, refreshKey]);
  return levels;
}

/** A level is clear. Returns the best time for it, or a sentence if refused. */
export async function recordLevelClear(
  game: string,
  level: number,
  ms: number,
): Promise<{ best_ms: number; new_best: boolean } | string> {
  const { data, error } = await supabase.rpc("record_level_clear", { game, level, ms: Math.round(ms) });
  if (error) return error.message;
  const row = (Array.isArray(data) ? data[0] : data) as { best_ms: number; new_best: boolean } | undefined;
  return row ?? "No reply.";
}

export function formatScore(n: number): string {
  return n.toLocaleString("en-US");
}
