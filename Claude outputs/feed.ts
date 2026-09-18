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
  game_name: string | null;
  game_cover: string | null;
  likes: number;
  liked_by_me: boolean;
  mine: boolean;
};

export async function getFeed(
  scope: FeedScope = "everyone",
  beforeId?: number,
): Promise<Post[]> {
  const { data, error } = await supabase.rpc("get_feed", {
    scope,
    max_results: 50,
    before_id: beforeId ?? null,
  });

  if (error || !data) return [];
  return data as Post[];
}

export async function createPost(body: string, gameId?: number | null) {
  const { data: session } = await supabase.auth.getSession();
  const authorId = session.session?.user.id;
  if (!authorId) return { error: { message: "Not signed in" } };

  return supabase
    .from("posts")
    .insert({ author_id: authorId, body, game_id: gameId ?? null });
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
