import { supabase } from "./supabase";

/**
 * The numbers on a profile.
 *
 * Almost all of these are counters maintained by triggers rather than
 * counts run at read time — see supabase/43_profile_stats.sql for why
 * (short version: deleting a post must not make "posts made" go
 * down). Two are worked out on the spot: how long they've been here,
 * and how many different people they've played with.
 */

export type ProfileStats = {
  member_since: string;
  days_member: number;
  posts_made: number;
  comments_made: number;
  likes_given: number;
  likes_received: number;
  sessions_hosted: number;
  sessions_joined: number;
  invites_sent: number;
  invites_accepted: number;
  played_with: number;
  friends_now: number;
  friends_peak: number;
  friends_peak_at: string | null;
};

export async function getProfileStats(
  userId: string,
): Promise<ProfileStats | null> {
  const { data, error } = await supabase
    .rpc("get_profile_stats", { target: userId })
    .maybeSingle();

  if (error || !data) return null;
  return data as ProfileStats;
}

/**
 * "12 days", "5 months", "2 years".
 *
 * Deliberately coarse. Nobody wants to read "1 year, 3 months and 6
 * days" on a profile, and the exact date is on the tile underneath it
 * anyway.
 */
export function membershipLength(days: number): string {
  if (days < 1) return "Today";
  if (days === 1) return "1 day";
  if (days < 45) return `${days} days`;

  const months = Math.round(days / 30.44);
  if (months < 24) return months === 1 ? "1 month" : `${months} months`;

  const years = Math.floor(days / 365.25);
  return years === 1 ? "1 year" : `${years} years`;
}

/** "Sep 2026" — the date under the headline figure. */
export function joinedMonth(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

/**
 * 1,204 rather than 1204.
 *
 * Four figures is where an unseparated number starts being read as
 * the wrong number, and these are meant to be glanced at.
 */
export function tally(n: number): string {
  return n.toLocaleString();
}
