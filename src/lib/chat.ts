import { supabase } from "./supabase";

export type Conversation = {
  conversation_id: number;
  /**
   * The other person — direct chats only. A session chat has no
   * "other", so all of these are null there and anything rendering a
   * conversation has to check `kind` before reaching for them.
   */
  other_id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  last_seen_at: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_from_me: boolean | null;
  unread: number;
  /** 'direct' for a DM, 'session' for a session's group chat. */
  kind: "direct" | "session";
  /** The session this chat belongs to, for linking back to it. */
  post_id: number | null;
  /** Session chats only: the game's name. Computed, so it follows the post. */
  title: string | null;
  member_count: number;
};

export type ConversationMember = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
};

/** What to call a conversation, in a list row or a thread header. */
export function conversationName(c: Conversation): string {
  if (c.kind === "session") return c.title ?? "Session";
  return c.display_name || c.username || "Unknown";
}

export type Message = {
  id: number;
  conversation_id: number;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  /**
   * Set once the sender deletes it. `body` is replaced server-side at
   * the same moment — the original never reaches the client — so this
   * is only here to style the gap as a tombstone rather than a message.
   */
  deleted_at: string | null;
};

export async function getConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc("get_conversations");
  if (error || !data) return [];
  return data as Conversation[];
}

/** Who's in a group chat. Used for the thread header. */
export async function getConversationMembers(
  conversationId: number,
): Promise<ConversationMember[]> {
  const { data, error } = await supabase.rpc("get_conversation_members", {
    conversation: conversationId,
  });
  if (error || !data) return [];
  return data as ConversationMember[];
}

/**
 * Whether you're allowed to start a conversation with someone.
 *
 * Used only to decide what the button looks like — the real check is
 * in the database, where it can't be skipped.
 */
export async function canMessage(otherId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_message", { other: otherId });
  if (error) return false;
  return Boolean(data);
}

/** Opens the thread with someone, creating it the first time. */
export async function openConversation(otherId: string) {
  return supabase.rpc("get_or_create_conversation", { other: otherId });
}

export async function getMessages(conversationId: number): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at, read_at, deleted_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error || !data) return [];
  return data as Message[];
}

export async function sendMessage(conversationId: number, body: string) {
  const { data: session } = await supabase.auth.getSession();
  const senderId = session.session?.user.id;
  if (!senderId) return { error: { message: "Not signed in" } };

  return supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, body });
}

export async function markRead(conversationId: number) {
  return supabase.rpc("mark_conversation_read", {
    conversation: conversationId,
  });
}

/**
 * Listens for new messages in one thread.
 *
 * This is the piece that makes chat feel live rather than something you
 * refresh. Row-level security applies to these events too, so you only
 * ever receive messages from conversations you're part of.
 *
 * Returns a function that stops listening - call it when leaving the
 * thread, or you'll stack up a subscription per conversation opened.
 */
export function subscribeToMessages(
  conversationId: number,
  onMessage: (message: Message) => void,
) {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onMessage(payload.new as Message),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** "14:32" for today, "Mon 14:32" this week, "3 Feb" beyond that. */
export function messageTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (sameDay) return time;

  const daysAgo = (now.getTime() - date.getTime()) / 86_400_000;
  if (daysAgo < 7) {
    return `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
  }

  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

/**
 * Delete one of your own messages.
 *
 * Soft: it becomes "Message deleted" for everyone in the conversation.
 * The original text moves to a table no API caller can read, so a
 * report about what was said is still investigable. The database
 * enforces sender-only — this call is just the button.
 */
export async function deleteMessage(messageId: number) {
  return supabase.rpc("delete_message", { message: messageId });
}

/**
 * Delete a conversation from your list.
 *
 * Yours only — the other person keeps theirs. Messages older than this
 * moment stay invisible to you even if they write again and the chat
 * reappears, so "delete" doesn't quietly undo itself.
 *
 * Refuses on session chats: those members are the session roster, so
 * the way out is to leave the session.
 */
export async function leaveConversation(conversationId: number) {
  return supabase.rpc("leave_conversation", { conversation: conversationId });
}
