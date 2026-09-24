import { supabase } from "./supabase";

export type Match = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  bio: string | null;
  region: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  platforms: string[];
  primary_platform: string | null;
  availability: string[];
  last_seen_at: string | null;
  score: number;
  /** The best anyone could score against your profile. The denominator. */
  max_score: number;
  /** Every game you have in common, from Top 5s and libraries alike. */
  shared_games: string[];
  /**
   * Only the games you BOTH rank in your Top 5.
   *
   * Separate from `shared_games` because the card used to claim every
   * shared game was a Top 5 game. Move something out of your Top 5 but
   * keep it in your library and it still matches — for fewer points —
   * so "in your Top 5" became a false claim that read as a bug in the
   * matching itself. See supabase/26_match_reason.sql.
   */
  shared_top_games: string[];
  shared_platforms: string[];
  shared_availability: string[];
  shared_genres: string[];
  /** How many players match the filters altogether. Same on every row. */
  total_count: number;
};

/** Find players shows this many per page. The database caps it at 100. */
export const PAGE_SIZE = 30;

export type MatchFilters = {
  gameId?: number | null;
  platform?: string | null;
  region?: string | null;
};

/**
 * One page of Find players, best match first.
 *
 * `page` counts from 0. Everyone who matches the filters is reachable
 * — the old version returned the top 30 and nobody below that could
 * ever be found. See supabase/70_find_players_paging.sql.
 */
export async function findPlayers(filters: MatchFilters = {}, page = 0) {
  return supabase.rpc("find_players", {
    filter_game_id: filters.gameId ?? null,
    filter_platform: filters.platform ?? null,
    filter_region: filters.region ?? null,
    max_results: PAGE_SIZE,
    skip_results: Math.max(0, page) * PAGE_SIZE,
  });
}

/** Marks you as recently active, which feeds the recency part of the score. */
export async function touchLastSeen() {
  return supabase.rpc("touch_last_seen");
}

/**
 * The overlap, without the score or the profile around it.
 *
 * matchReason() and the profile header both work off this and nothing
 * else, so a smaller answer from the database — match_with() returns
 * one pair rather than a list — can use the same wording.
 */
export type SharedGround = Pick<
  Match,
  | "shared_games"
  | "shared_top_games"
  | "shared_platforms"
  | "shared_availability"
  | "shared_genres"
>;

/** Is there anything at all to say? */
export function sharesAnything(m: SharedGround): boolean {
  return (
    (m.shared_games?.length ?? 0) > 0 ||
    (m.shared_genres?.length ?? 0) > 0 ||
    (m.shared_platforms?.length ?? 0) > 0 ||
    (m.shared_availability?.length ?? 0) > 0
  );
}

/**
 * Turns a match into the one line that explains itself.
 *
 * This matters more than the score's accuracy. A visible reason makes a
 * mediocre match feel considered; a hidden one makes a good match feel
 * random. Always lead with the strongest signal.
 */
export function matchReason(match: SharedGround): string {
  const parts: string[] = [];

  // Claim a Top 5 match only when it IS one. Everything else is a real
  // match too — just from a library rather than a Top 5 — and saying so
  // plainly is better than overstating it.
  const top = match.shared_top_games ?? [];
  const all = match.shared_games;

  if (top.length === 1) {
    parts.push(`You both have ${top[0]} in your Top 5`);
  } else if (top.length > 1) {
    parts.push(`${top.length} Top 5 games in common, including ${top[0]}`);
  } else if (all.length === 1) {
    parts.push(`You both play ${all[0]}`);
  } else if (all.length > 1) {
    parts.push(`${all.length} games in common, including ${all[0]}`);
  } else if (match.shared_genres.length > 0) {
    parts.push(`You both play ${match.shared_genres.slice(0, 2).join(" and ")}`);
  }

  if (match.shared_platforms.length > 0) {
    parts.push(`both on ${match.shared_platforms[0]}`);
  }

  if (match.shared_availability.length > 0) {
    parts.push(`both around ${match.shared_availability[0].toLowerCase()}`);
  }

  if (parts.length === 0) return "Same region";

  return parts.join(" · ");
}

/** "2 hours ago", "3 days ago", or null if we've never seen them. */
export function lastSeenLabel(iso: string | null): string | null {
  if (!iso) return null;

  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutes < 5) return "online now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return "a while ago";
}

/** How many friends somebody has. Public to any signed-in player. */
export async function getFriendCount(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("friend_count", {
    target: userId,
  });
  if (error || data === null) return 0;
  return Number(data);
}

/**
 * Somebody's friends, scored against you.
 *
 * Deliberately the same shape as findPlayers(), because it is the same
 * scoring — see supabase/35_friends_of.sql. That means the cards can
 * be the identical component and a percentage means the same thing
 * wherever you read it.
 *
 * Note this can include people you're already friends with: seeing
 * which of someone's friends you already know is half the reason to
 * open the list.
 */
export async function getFriendsOf(userId: string): Promise<Match[]> {
  const { data, error } = await supabase.rpc("friends_of", {
    target: userId,
    max_results: 50,
  });
  if (error || !data) return [];
  return data as Match[];
}

/**
 * How well you match one particular person.
 *
 * The same arithmetic as findPlayers() and getFriendsOf(), pointed at a
 * single profile — see supabase/55_match_with.sql. Returns null when
 * there is no score to show: yourself, somebody blocked, or nobody
 * signed in.
 *
 * Nothing about this is stored or cached, here or in the database. The
 * number is meant to move — it is built out of two Top 5s, two
 * libraries and how recently you both played, and all of that changes.
 * Somebody who matches you 90% now will not in two years, because the
 * games it is counting will not be the games either of you is playing.
 * So it is recomputed on every view, and there is deliberately no
 * column anywhere holding yesterday's answer.
 */
export async function getMatchWith(
  userId: string,
): Promise<MatchWith | null> {
  const { data, error } = await supabase.rpc("match_with", {
    target: userId,
  });

  if (error || !data || (data as MatchWith[]).length === 0) return null;
  return (data as MatchWith[])[0];
}

export type MatchWith = SharedGround & {
  score: number;
  max_score: number;
  /**
   * Whether YOUR profile has enough on it to compare.
   *
   * False means no games in your Top 5 or library, and the percentage
   * has to be suppressed rather than shown. The denominator is the best
   * anyone could score against you, so an empty profile makes that
   * denominator 5 — the recency bonus alone — and every reasonably
   * active stranger comes out at 100%. Arithmetically true, and a lie
   * to anybody reading it.
   */
  you_ready: boolean;
  /** Same, for theirs. A new account isn't a bad match, it's an unknown one. */
  they_ready: boolean;
};
