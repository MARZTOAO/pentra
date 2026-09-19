import { supabase } from "./supabase";
import type { FriendStatus } from "./friends";

export type SearchResult = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  primary_platform: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  last_seen_at: string | null;
  friend_status: FriendStatus;
  /** True when the query was this person's friend code, not their name. */
  matched_code: boolean;
};

/**
 * One box, two jobs: a friend code finds exactly one person, a name
 * finds everyone close to it. Which one it was is decided in the
 * database — see supabase/20_friend_codes.sql.
 */
export async function searchPlayers(q: string): Promise<SearchResult[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  const { data, error } = await supabase.rpc("search_players", { q: query });
  if (error || !data) return [];
  return data as SearchResult[];
}

/**
 * The characters a code can contain. I, L, O and U are missing on
 * purpose: the first three get misread when a code is read aloud,
 * and leaving U out keeps accidental words from forming.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Turn whatever someone typed into the canonical eight characters.
 * Mirrors normalize_friend_code() in the database, so the client can
 * tell a code from a name before making a request.
 */
export function normalizeCode(raw: string): string {
  return raw
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase()
    .replace(/I/g, "1")
    .replace(/L/g, "1")
    .replace(/O/g, "0");
}

/** How many characters a code is. Ten - see the SQL for why. */
export const CODE_LENGTH = 10;

/** Is this a complete, valid-looking code? */
export function looksLikeCode(raw: string): boolean {
  const code = normalizeCode(raw);
  if (code.length !== CODE_LENGTH) return false;
  return [...code].every((c) => ALPHABET.includes(c));
}

/** A1B2C3D4E5 -> A1B2C-3D4E5. The dash is only ever for reading. */
export function formatCode(code: string | null | undefined): string {
  if (!code) return "";
  const clean = code.replace(/[^0-9A-Z]/gi, "").toUpperCase();
  if (clean.length !== CODE_LENGTH) return clean;
  return `${clean.slice(0, 5)}-${clean.slice(5)}`;
}

