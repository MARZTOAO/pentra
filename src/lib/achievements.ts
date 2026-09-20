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

/**
 * Tells you the moment one is earned.
 *
 * Achievements are awarded by triggers inside the database, so nothing
 * in the browser knows unless the row's arrival is itself the message.
 * That needs profile_achievements published to realtime — see
 * supabase/51_realtime_achievements.sql. Without it this subscribes
 * happily and never fires, which is a quiet way to lose an afternoon.
 *
 * The payload carries the code and nothing else, so the names are
 * fetched in one follow-up query. That costs a round trip on an event
 * that happens a handful of times in an account's life.
 */
export function subscribeToUnlocks(
  userId: string,
  onUnlocked: (codes: string[]) => void,
) {
  const channel = supabase
    .channel(`achievements:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "profile_achievements",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const code = (payload.new as { code?: string })?.code;
        if (code) onUnlocked([code]);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * "Have I earned anything since you last looked?"
 *
 * The answer to the achievements that no trigger can catch: nothing
 * happens in the database on the anniversary of somebody signing up,
 * or when a new week turns their streak into twelve. Time passing is
 * not an event. Called on load, and a backstop for any derived stat
 * that changes by a route without a trigger on it. See
 * supabase/52_fix_derived_achievements.sql.
 */
export async function checkMyAchievements() {
  return supabase.rpc("check_my_achievements");
}

/** Names and descriptions for a set of codes, in one query. */
export async function getAchievementDetails(
  codes: string[],
): Promise<Pick<Achievement, "code" | "name" | "description" | "category">[]> {
  if (codes.length === 0) return [];

  const { data, error } = await supabase
    .from("achievements")
    .select("code, name, description, category")
    .in("code", codes);

  if (error || !data) return [];
  return data as Pick<
    Achievement,
    "code" | "name" | "description" | "category"
  >[];
}
