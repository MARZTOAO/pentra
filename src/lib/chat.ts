import { supabase } from "./supabase";

export type Conversation = {
  conversation_id: number;
  other_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  last_seen_at: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_from_me: boolean | null;
  unread: number;
};

export type Message = {
  id: number;
  conversation_id: number;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export async function getConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc("get_conversations");
  if (error || !data) return [];
  return data as Conversation[];
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
    .select("id, conversation_id, sender_id, body, created_at, read_at")
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
