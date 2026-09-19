import { supabase } from "./supabase";

export type Game = {
  id: number;
  name: string;
  cover_url: string | null;
  genres: string[];
  platforms: string[];
  /** Null means IGDB has no date — not that it's unreleased. */
  release_date?: string | null;
};

/** Has this game come out yet? A missing date counts as released. */
export function isUnreleased(game: Pick<Game, "release_date">): boolean {
  if (!game.release_date) return false;
  return new Date(game.release_date).getTime() > Date.now();
}

/**
 * "Out 12 Mar", "Out tomorrow", "Out today" — or null once it's out.
 *
 * Worth saying on any unreleased game: without it, a game with no
 * ratings and no posts looks like a mistake in the catalogue rather
 * than something that simply hasn't happened yet.
 */
export function releaseLabel(game: Pick<Game, "release_date">): string | null {
  if (!isUnreleased(game)) return null;

  const date = new Date(game.release_date as string);
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);

  if (days <= 1) return "Out tomorrow";
  if (days <= 7) return `Out in ${days} days`;

  const sameYear = date.getFullYear() === new Date().getFullYear();

  return (
    "Out " +
    date.toLocaleDateString([], {
      day: "numeric",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
    })
  );
}

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
    .select("id, name, cover_url, genres, platforms, release_date")
    .ilike("name", `%${term}%`)
    // `relevance` is rating count for released games and follower count
    // for announced ones — see supabase/23_upcoming_games.sql. Sorting
    // on popularity alone would bury every unreleased game.
    .order("relevance", { ascending: false })
    .limit(24);

  if (error || !data) return [];
  return data as Game[];
}
