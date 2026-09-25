import { supabase } from "./supabase";

/**
 * Commendations and the player rating.
 *
 * Two numbers that are easy to confuse, kept apart on purpose — see
 * supabase/65_player_rating.sql for the reasoning:
 *
 *   commendation_count  how many times players have vouched for you.
 *                       Cumulative, never drops. Given from a session
 *                       you shared or straight from a profile, but one
 *                       per person per 30 DAYS whichever way — see
 *                       supabase/73_commend_from_profile.sql.
 *   rating              starts at 100 and only falls when a moderator
 *                       actions a report. Commendations earned after
 *                       that repair it, back up to 100.
 *
 * A report on its own does nothing. Anyone can file one, so if reports
 * moved the number by themselves a handful of alt accounts could ruin
 * somebody in a minute.
 */

/** How long before you can commend the same player again. The
    database's commend_cooldown() is the rule; this is for display. */
export const COMMEND_COOLDOWN_DAYS = 30;

export type Commendable = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  /** True while your 30-day cooldown for this person is still running. */
  commended: boolean;
  /** When you could vouch for them again. Null means you can right now. */
  available_at: string | null;
};

/** "in 3 days", for a cooldown that hasn't lifted yet. */
export function commendableIn(availableAt: string | null): string | null {
  if (!availableAt) return null;
  const days = Math.ceil(
    (new Date(availableAt).getTime() - Date.now()) / 86_400_000,
  );
  if (days <= 0) return null;
  return days === 1 ? "in a day" : `in ${days} days`;
}

export type RatingTier = "good" | "watch" | "poor";

/**
 * Three bands rather than a raw number on its own.
 *
 * 100 is where everybody starts and where most people stay, so the
 * badge mostly says "nothing has gone wrong" — which is the honest
 * reading of it.
 */
export function ratingTier(rating: number): RatingTier {
  if (rating >= 95) return "good";
  if (rating >= 60) return "watch";
  return "poor";
}

export function ratingLabel(rating: number): string {
  switch (ratingTier(rating)) {
    case "good":
      return "Good standing";
    case "watch":
      return "Needs work";
    default:
      return "Poor standing";
  }
}

/**
 * The one-line explanation, for a tooltip. Deliberately says what
 * moves the number, because a score nobody can explain feels arbitrary
 * and unfair the first time it drops.
 */
export function ratingHint(rating: number, isSelf: boolean): string {
  if (ratingTier(rating) === "good") {
    return isSelf
      ? "Everyone starts here. It only drops if a report against you is upheld."
      : "Nothing has been upheld against this player.";
  }
  return isSelf
    ? "A report against you was upheld. Commendations from other players bring it back up."
    : "A report against this player was upheld.";
}

/** Who you can still commend from a session you were both in. */
export async function sessionCommendables(
  postId: number,
): Promise<Commendable[]> {
  const { data, error } = await supabase.rpc("session_commendables", {
    session: postId,
  });
  if (error || !data) return [];
  return data as Commendable[];
}

/**
 * Vouch for somebody you played with.
 *
 * Returns 'commended', or 'already' if the 30-day cooldown for this
 * person is still running. The database enforces it and serialises the
 * pair, so the button is safe to press twice.
 */
export async function commend(
  otherId: string,
  postId: number,
): Promise<{ result: "commended" | "already" | null; error: string | null }> {
  const { data, error } = await supabase.rpc("commend", {
    other: otherId,
    session: postId,
  });

  if (error) return { result: null, error: error.message };
  return { result: data as "commended" | "already", error: null };
}

/**
 * Vouch for somebody from their profile. No shared session needed.
 *
 * Same 30-day cooldown as the session route — the two share it, so
 * one can't be used to get round the other. Returns 'commended', or
 * 'already' if you've commended them in the last 30 days.
 */
export async function commendPlayer(
  otherId: string,
): Promise<{ result: "commended" | "already" | null; error: string | null }> {
  const { data, error } = await supabase.rpc("commend_player", {
    other: otherId,
  });

  if (error) return { result: null, error: error.message };
  return { result: data as "commended" | "already", error: null };
}

export type CommendStatus = {
  /** Whether the button should be live right now. */
  can_commend: boolean;
  /** When the cooldown lifts. Null when it isn't running. */
  available_at: string | null;
};

/** Whether you can commend this player now, and if not, when. */
export async function commendStatus(
  otherId: string,
): Promise<CommendStatus | null> {
  const { data, error } = await supabase.rpc("commend_status", {
    other: otherId,
  });
  if (error || !data) return null;
  const row = (Array.isArray(data) ? data[0] : data) as CommendStatus | undefined;
  return row ?? null;
}
