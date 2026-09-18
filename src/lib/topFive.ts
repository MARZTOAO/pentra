import { supabase } from "./supabase";

export type Game = {
  id: number;
  name: string;
  cover_url: string | null;
  genres: string[];
  platforms: string[];
};

/** One slot in someone's Top 5, with the game details joined in. */
export type TopFiveEntry = {
  game: Game;
  rank: number;
  platform: string | null;
  note: string | null;
};

type Row = {
  game_id: number;
  rank: number;
  platform: string | null;
  note: string | null;
  games: Game | null;
};

export async function getTopFive(userId: string): Promise<TopFiveEntry[]> {
  const { data, error } = await supabase
    .from("top_five")
    .select("game_id, rank, platform, note, games(id, name, cover_url, genres, platforms)")
    .eq("user_id", userId)
    .order("rank");

  if (error || !data) return [];

  return (data as unknown as Row[])
    .filter((row) => row.games !== null)
    .map((row) => ({
      game: row.games as Game,
      rank: row.rank,
      platform: row.platform,
      note: row.note,
    }));
}

/**
 * Replaces the whole Top 5 at once. See supabase/04_top_five.sql for
 * why this goes through a database function rather than plain updates.
 */
export async function saveTopFive(entries: TopFiveEntry[]) {
  const items = entries.map((entry, index) => ({
    game_id: entry.game.id,
    rank: index + 1,
    platform: entry.platform ?? "",
    note: entry.note ?? "",
  }));

  return supabase.rpc("set_top_five", { items });
}

/** Search the local games catalogue. Fast, because it never leaves your database. */
export async function searchGames(query: string): Promise<Game[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const { data, error } = await supabase
    .from("games")
    .select("id, name, cover_url, genres, platforms")
    .ilike("name", `%${term}%`)
    .order("popularity", { ascending: false })
    .limit(24);

  if (error || !data) return [];
  return data as Game[];
}
