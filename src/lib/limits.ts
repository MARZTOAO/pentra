import { supabase } from "./supabase";

/**
 * Session limits for free accounts (supabase/82).
 *
 * Free: host 1 and join 3 upcoming sessions at a time. Pentra Pro: no
 * limit. Behind the `free_session_limits` flag until Pro goes on sale —
 * while it's off, `limited` is false for everybody and the app shows
 * nothing.
 *
 * The database enforces all of this on every way in. This is only so
 * the app can say so before you hit the wall.
 */
export type SessionLimits = {
  /** False when no limit applies to you (flag off, or Pro). */
  limited: boolean;
  /** Upcoming sessions you're hosting. */
  hosting: number;
  hostLimit: number;
  /** Upcoming sessions you've joined (not counting ones you host). */
  joined: number;
  joinLimit: number;
};

export async function getSessionLimits(): Promise<SessionLimits | null> {
  const { data, error } = await supabase.rpc("my_session_limits");
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        limited: boolean;
        hosting: number;
        host_limit: number;
        joined: number;
        join_limit: number;
      }
    | undefined;
  if (!row) return null;
  return {
    limited: Boolean(row.limited),
    hosting: Number(row.hosting ?? 0),
    hostLimit: Number(row.host_limit ?? 1),
    joined: Number(row.joined ?? 0),
    joinLimit: Number(row.join_limit ?? 3),
  };
}

/** The sentence for a free player at their join limit. */
export function joinLimitMessage(limit = 3): string {
  return `Free accounts can be in ${limit} upcoming sessions at a time. Leave one, or go Pentra Pro for no limit.`;
}
