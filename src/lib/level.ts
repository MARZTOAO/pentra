import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Player level (supabase/113_player_level.sql).
 *
 * XP is worked out on the server from what someone has done on Pentra
 * (posts, sessions, friends, commendations, achievements, Arcade,
 * chess), so there's nothing to award here; just read it.
 */

export type PlayerLevel = {
  user_id: string;
  xp: number;
  level: number;
  title: string;
  /** XP at which this level started. */
  level_floor: number;
  /** XP needed for the next level. */
  next_floor: number;
  rules: Record<string, number>;
};

export async function getPlayerLevel(userId?: string): Promise<PlayerLevel | null> {
  const { data, error } = await supabase.rpc("player_level", { p_user: userId ?? null });
  if (error || !data) return null;
  return data as PlayerLevel;
}

export function usePlayerLevel(userId: string | undefined, refreshKey = 0): PlayerLevel | null {
  const [lvl, setLvl] = useState<PlayerLevel | null>(null);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    getPlayerLevel(userId).then((l) => {
      if (active) setLvl(l);
    });
    return () => {
      active = false;
    };
  }, [userId, refreshKey]);
  return lvl;
}

/** 0–1 through the current level. */
export function levelProgress(l: PlayerLevel): number {
  const span = l.next_floor - l.level_floor;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (l.xp - l.level_floor) / span));
}

/** One line on how XP is earned, from the server's weights. */
export function xpHowTo(rules: Record<string, number>): string {
  return (
    `Post +${rules.post}, comment +${rules.comment}, host a session +${rules.session_hosted}, join one +${rules.session_joined}, ` +
    `a friend +${rules.friend}, a commendation +${rules.commendation}, an achievement +${rules.achievement}, ` +
    `an Arcade run +${rules.arcade_run}, a Stack Trace level +${rules.arcade_level}, a chess game +${rules.chess_game} (+${rules.chess_win} for a win), ` +
    `an invite who joins +${rules.invite_accepted}.`
  );
}
