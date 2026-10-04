import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * The Arcade — supabase/93_arcade.sql.
 *
 * The games live in src/arcade/. This file is the list of them and
 * the calls that record scores and read leaderboards. Adding a game:
 * a row in arcade_games (a migration), an entry in GAMES below, and a
 * page that mounts it (ArcadeGame.tsx switches on the slug).
 */

export type ArcadeGameInfo = {
  slug: string;
  name: string;
  tagline: string;
  /** How to play, in one line. */
  controls: string;
};

export const GAMES: ArcadeGameInfo[] = [
  {
    slug: "lag-spike",
    name: "Lag Spike",
    tagline: "Keep the signal running. Jump the spikes. It only gets faster.",
    controls: "Space, ↑ or tap to jump. Hold for a higher jump.",
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

export function formatScore(n: number): string {
  return n.toLocaleString("en-US");
}
