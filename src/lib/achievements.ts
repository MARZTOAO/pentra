import { supabase } from "./supabase";

/**
 * Badges.
 *
 * The catalogue lives in the database rather than here, so adding one
 * is an INSERT instead of a deploy and everybody sees the same list
 * the moment it changes. See supabase/44_achievements.sql.
 */

export type AchievementCategory =
  | "sessions"
  | "social"
  | "content"
  | "milestone";

export type Achievement = {
  code: string;
  /** Null for a secret one that hasn't been earned. */
  name: string | null;
  description: string | null;
  category: AchievementCategory;
  secret: boolean;
  earned_at: string | null;
  /** How far towards it, for the ones that count something. */
  progress: number | null;
  threshold: number | null;
};

export async function getAchievements(
  userId: string,
): Promise<Achievement[]> {
  const { data, error } = await supabase.rpc("get_achievements", {
    target: userId,
  });
  if (error || !data) return [];
  return data as Achievement[];
}

export function isEarned(a: Achievement): boolean {
  return a.earned_at !== null;
}

/**
 * 0 to 1, or null when there's nothing to measure.
 *
 * Moment achievements — filled a session, joined at short notice —
 * have no threshold: you either did it or you didn't, and a bar at
 * 0% would imply you were making your way towards it.
 */
export function progressRatio(a: Achievement): number | null {
  if (isEarned(a)) return 1;
  if (a.threshold === null || a.progress === null) return null;
  if (a.threshold <= 0) return null;
  return Math.min(1, a.progress / a.threshold);
}

/** "Jan 2026" — when it was earned. */
export function earnedMonth(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}
