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
};

export type MatchFilters = {
  gameId?: number | null;
  platform?: string | null;
  region?: string | null;
};

export async function findPlayers(filters: MatchFilters = {}) {
  return supabase.rpc("find_players", {
    filter_game_id: filters.gameId ?? null,
    filter_platform: filters.platform ?? null,
    filter_region: filters.region ?? null,
    max_results: 30,
  });
}

/** Marks you as recently active, which feeds the recency part of the score. */
export async function touchLastSeen() {
  return supabase.rpc("touch_last_seen");
}

/**
 * Turns a match into the one line that explains itself.
 *
 * This matters more than the score's accuracy. A visible reason makes a
 * mediocre match feel considered; a hidden one makes a good match feel
 * random. Always lead with the strongest signal.
 */
export function matchReason(match: Match): string {
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
