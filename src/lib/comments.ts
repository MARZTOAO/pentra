import { supabase } from "./supabase";

/**
 * Replies under a post.
 *
 * Deleting is hard here, unlike messages — a comment under a public
 * post simply goes, rather than leaving a tombstone. The reasoning is
 * in supabase/39_comments.sql.
 */

export type Comment = {
  id: number;
  body: string;
  created_at: string;
  author_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  mine: boolean;
  /** Your own, or anything on a post of yours. The database enforces
   *  the same rule; this only decides whether to draw the button. */
  can_delete: boolean;
};

export async function getComments(postId: number): Promise<Comment[]> {
  const { data, error } = await supabase.rpc("get_comments", {
    want_post: postId,
  });
  if (error || !data) return [];
  return data as Comment[];
}

export async function addComment(postId: number, body: string) {
  const { data: session } = await supabase.auth.getSession();
  const authorId = session.session?.user.id;
  if (!authorId) return { error: { message: "Not signed in" } };

  return supabase
    .from("post_comments")
    .insert({ post_id: postId, author_id: authorId, body });
}

export async function deleteComment(id: number) {
  return supabase.from("post_comments").delete().eq("id", id);
}

/**
 * Comment counts for a whole feed, in one call.
 *
 * get_feed and get_post return a fixed column list and `create or
 * replace` cannot change a function's return type, so adding a count
 * to them means dropping and recreating two long functions. A batched
 * lookup is far less to disturb — the same trade as getPresenceMap.
 */
export async function getCommentCounts(
  postIds: number[],
): Promise<Record<number, number>> {
  if (postIds.length === 0) return {};

  const { data, error } = await supabase.rpc("comment_counts", {
    ids: postIds,
  });
  if (error || !data) return {};

  const map: Record<number, number> = {};
  for (const row of data as { post_id: number; total: number }[]) {
    map[row.post_id] = Number(row.total);
  }
  return map;
}
