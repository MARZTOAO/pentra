import { supabase } from "./supabase";

/**
 * Invites into a session.
 *
 * A pending invite is not a session_players row — it lives in its own
 * table, because inserting into session_players *is* joining: it puts
 * you in the session's group chat and tells the host you're in. See
 * supabase/42_session_invites.sql.
 *
 * The slot is held while the invite waits, and the hold lapses on its
 * own once the session starts.
 */

export type SessionInvite = {
  post_id: number;
  invitee_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  inviter_id: string;
  inviter_name: string | null;
  /** This one is addressed to you — the card offers Accept / Decline. */
  mine: boolean;
};

/** What accept_session_invite() reports. Every case is answered in the UI. */
export type AcceptResult =
  | "joined"
  | "already"
  | "full"
  | "past"
  | "no_invite"
  | "missing"
  | "not_session"
  | "signed_out";

/**
 * Pending invites for a set of posts, batched the way comment counts
 * are — a feed full of sessions costs one query, not one per card.
 */
export async function getSessionInvites(
  postIds: number[],
): Promise<SessionInvite[]> {
  if (postIds.length === 0) return [];

  const { data, error } = await supabase.rpc("session_invites_for", {
    posts: postIds,
  });
  if (error || !data) return [];
  return data as SessionInvite[];
}

export async function inviteToSession(postId: number, guests: string[]) {
  return supabase.rpc("invite_to_session", { post: postId, guests });
}

export async function acceptSessionInvite(postId: number) {
  return supabase.rpc("accept_session_invite", { post: postId });
}

export async function declineSessionInvite(postId: number) {
  return supabase.rpc("decline_session_invite", { post: postId });
}

export async function cancelSessionInvite(postId: number, guest: string) {
  return supabase.rpc("cancel_session_invite", {
    post: postId,
    guest,
  });
}
