import { supabase } from "./supabase";

export type FriendDirection = "friend" | "incoming" | "outgoing";

export type FriendRow = {
  friendship_id: number;
  other_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  last_seen_at: string | null;
  direction: FriendDirection;
  created_at: string;
};

/** Everything the Friends screen needs, in one call. */
export async function getFriendList(): Promise<FriendRow[]> {
  const { data, error } = await supabase.rpc("get_friend_list");
  if (error || !data) return [];
  return data as FriendRow[];
}

export type FriendStatus = "none" | "friend" | "incoming" | "outgoing";

export async function getFriendStatus(other: string): Promise<FriendStatus> {
  const { data, error } = await supabase.rpc("get_friend_status", { other });
  if (error || !data) return "none";
  return data as FriendStatus;
}

/**
 * Sends a request — or accepts theirs, if they already asked you.
 * That's what a person means when they click Add on someone whose
 * request is already sitting in their list.
 */
export async function sendFriendRequest(target: string) {
  return supabase.rpc("send_friend_request", { target });
}

export async function respondToRequest(friendshipId: number, accept: boolean) {
  return supabase.rpc("respond_to_friend_request", {
    friendship_id: friendshipId,
    accept,
  });
}

/** Removes a friend, or cancels a request you sent. Same row either way. */
export async function removeFriend(other: string) {
  return supabase.rpc("remove_friend", { other });
}

/** Marks you as active. Feeds both the online dot and match scoring. */
export async function heartbeat() {
  return supabase.rpc("touch_last_seen");
}

// isOnline() used to live here. It answered a yes/no question that the
// app no longer asks: since 32_presence.sql a player can also be away,
// and telling that apart needs the presence column as well as the
// timestamp. presenceOf() in lib/presence.ts replaced it everywhere.
