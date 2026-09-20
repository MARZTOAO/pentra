import { supabase } from "./supabase";
import type { Game } from "./topFive";

/**
 * The library: games someone owns and plays now and then.
 *
 * Deliberately not connected to the Top 5 — no ranking, no order, and
 * a game can sit in both. The Top 5 is what you love; this is what
 * you'd say yes to on a Tuesday, which is usually the more useful
 * answer to "what can the two of us play tonight?".
 */

/**
 * Must match the cap enforced by cap_game_library() in the database —
 * see supabase/50_library_cap_28.sql. This constant only decides what
 * the counter reads and when the Add button stops offering; the
 * trigger is what actually refuses. Change one without the other and
 * the app invites you to add a game the database will reject.
 */
export const MAX_LIBRARY = 28;

export async function getLibrary(userId: string): Promise<Game[]> {
  const { data, error } = await supabase
    .from("game_library")
    .select(
      "added_at, games(id, name, cover_url, genres, platforms, release_date)",
    )
    .eq("user_id", userId)
    .order("added_at", { ascending: false });

  if (error || !data) return [];

  return (data as unknown as { games: Game | null }[])
    .map((row) => row.games)
    .filter((g): g is Game => g !== null);
}

export async function addToLibrary(userId: string, gameId: number) {
  return supabase
    .from("game_library")
    .insert({ user_id: userId, game_id: gameId });
}

export async function removeFromLibrary(userId: string, gameId: number) {
  return supabase
    .from("game_library")
    .delete()
    .eq("user_id", userId)
    .eq("game_id", gameId);
}
