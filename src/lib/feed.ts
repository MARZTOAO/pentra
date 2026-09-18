import { supabase } from "./supabase";

export type FeedScope = "everyone" | "friends";

export type Post = {
  id: number;
  body: string;
  created_at: string;
  author_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  game_id: number | null;
  game_name: string | null;
  game_cover: string | null;
  likes: number;
  liked_by_me: boolean;
  mine: boolean;

  /** 'text' for an ordinary post, 'lfg' for a session. */
  kind: "text" | "lfg";
  starts_at: string | null;
  slots: number | null;
  taken: number;
  i_joined: boolean;
  players: SessionPlayer[];
};

export type SessionPlayer = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  is_host: boolean;
};

export async function getFeed(
  scope: FeedScope = "everyone",
  gameId?: number | null,
  sessionsOnly = false,
  beforeId?: number,
): Promise<Post[]> {
  const { data, error } = await supabase.rpc("get_feed", {
    scope,
    max_results: 50,
    before_id: beforeId ?? null,
    filter_game_id: gameId ?? null,
    sessions_only: sessionsOnly,
  });

  if (error || !data) return [];
  return data as Post[];
}

export type FeedGame = {
  game_id: number;
  name: string;
  cover_url: string | null;
  posts: number;
};

/**
 * Games people have actually posted about, busiest first.
 *
 * The filter is built from this rather than the full catalogue - an
 * option list where every entry leads to real posts, instead of 20,000
 * games that mostly return nothing.
 */
export async function getFeedGames(): Promise<FeedGame[]> {
  const { data, error } = await supabase.rpc("get_feed_games");
  if (error || !data) return [];
  return data as FeedGame[];
}

export async function createPost(
  body: string,
  gameId?: number | null,
  session?: { startsAt: string; slots: number } | null,
) {
  const { data: auth } = await supabase.auth.getSession();
  const authorId = auth.session?.user.id;
  if (!authorId) return { error: { message: "Not signed in" } };

  return supabase.from("posts").insert({
    author_id: authorId,
    body,
    game_id: gameId ?? null,
    kind: session ? "lfg" : "text",
    starts_at: session?.startsAt ?? null,
    slots: session?.slots ?? null,
  });
}

/** Returns what happened: joined, full, already, past, or an error. */
export async function joinSession(postId: number) {
  return supabase.rpc("join_session", { post: postId });
}

export async function leaveSession(postId: number) {
  return supabase.rpc("leave_session", { post: postId });
}

/** "Tonight 21:00", "Sat 20:00", "3 Feb 19:30", or "started". */
export function sessionTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();

  if (date.getTime() < now.getTime()) return "started";

  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const today = date.toDateString() === now.toDateString();
  if (today) return `Today ${time}`;

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow ${time}`;
  }

  const days = (date.getTime() - now.getTime()) / 86_400_000;
  if (days < 7) {
    return `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
  }

  return `${date.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

/** How long until it starts, for the urgency line. */
export function startsIn(iso: string): string | null {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);

  if (minutes < 0) return null;
  if (minutes < 60) return `in ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;

  return null;
}

export async function deletePost(id: number) {
  return supabase.from("posts").delete().eq("id", id);
}

/** Returns true if the post is now liked, false if the like was removed. */
export async function toggleLike(postId: number) {
  return supabase.rpc("toggle_like", { post: postId });
}

/** "just now", "12m", "3h", "5d", then a date. */
export function postTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  return new Date(iso).toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
}
