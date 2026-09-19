import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import {
  getConversations,
  getMessages,
  sendMessage,
  markRead,
  subscribeToMessages,
  messageTime,
  type Conversation,
  type Message,
} from "../lib/chat";
import { isOnline } from "../lib/friends";
import { Avatar } from "../components/Avatar";
import { useNotifications } from "../components/Notifications";
import { FullScreenLoader } from "../components/ui";

export default function Messages() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const activeId = id ? Number(id) : null;
  const active = conversations.find((c) => c.conversation_id === activeId);

  const load = useCallback(async () => {
    setConversations(await getConversations());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <FullScreenLoader />;

  return (
    <div className="flex h-full">
      {/* Conversation list.
          Two panes side by side need a desktop's width. On a phone it's
          one at a time — the list until you open a thread, then the
          thread, with the top bar's Back returning you here. */}
      <aside
        className={
          "shrink-0 overflow-y-auto border-r border-line md:block md:w-72 " +
          (activeId ? "hidden w-full" : "block w-full")
        }
      >
        <div className="px-4 py-4">
          <h1 className="display text-lg">Messages</h1>
        </div>

        {conversations.length === 0 ? (
          <p className="px-4 text-sm text-muted">
            No conversations yet.{" "}
            <Link to="/discover" className="text-accent hover:underline">
              Find someone
            </Link>{" "}
            and say hello.
          </p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.conversation_id}
              onClick={() => navigate(`/messages/${c.conversation_id}`)}
              className={
                "flex w-full items-center gap-3 border-b border-line/60 px-4 py-3 text-left transition " +
                (c.conversation_id === activeId
                  ? "bg-surface-2"
                  : "hover:bg-surface-2/60")
              }
            >
              <div className="relative shrink-0">
                <Avatar of={c} size={40} />
                {isOnline(c.last_seen_at) && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg bg-ok" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {c.display_name || c.username}
                </p>
                <p className="truncate text-xs text-muted">
                  {c.last_message
                    ? (c.last_from_me ? "You: " : "") + c.last_message
                    : "No messages yet"}
                </p>
              </div>

              {c.unread > 0 && (
                <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-onaccent">
                  {c.unread}
                </span>
              )}
            </button>
          ))
        )}
      </aside>

      {/* Thread */}
      {active && user ? (
        <Thread
          key={active.conversation_id}
          conversation={active}
          myId={user.id}
          onSent={load}
        />
      ) : (
        <div className="hidden flex-1 items-center justify-center p-6 text-center sm:p-10 md:flex">
          <p className="max-w-xs text-sm text-muted">
            {conversations.length === 0
              ? "Nothing here yet. Open someone's profile and hit Message."
              : "Pick a conversation on the left."}
          </p>
        </div>
      )}
    </div>
  );
}

function Thread({
  conversation,
  myId,
  onSent,
}: {
  conversation: Conversation;
  myId: string;
  onSent: () => void;
}) {
  // Marking a thread read has to update the sidebar badge too, not just
  // this screen's own list.
  const { refresh: refreshBadge } = useNotifications();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  // Load history, mark it read, then listen for anything new.
  useEffect(() => {
    let active = true;

    getMessages(conversation.conversation_id).then((rows) => {
      if (!active) return;
      setMessages(rows);
      markRead(conversation.conversation_id).then(() => {
        onSent();
        refreshBadge();
      });
    });

    const unsubscribe = subscribeToMessages(
      conversation.conversation_id,
      (message) => {
        setMessages((current) =>
          // The realtime event also fires for our own message, which we
          // already added locally. Skip anything we've seen.
          current.some((m) => m.id === message.id) ? current : [...current, message],
        );

        if (message.sender_id !== myId) {
          markRead(conversation.conversation_id).then(() => {
            onSent();
            refreshBadge();
          });
        }
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [conversation.conversation_id, myId, onSent, refreshBadge]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setDraft("");

    const { error } = await sendMessage(conversation.conversation_id, body);

    setSending(false);

    if (error) {
      // Put it back rather than losing what they typed.
      setDraft(body);
      return;
    }

    onSent();
  }

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
        <Avatar of={conversation} size={36} />
        <div className="min-w-0">
          <Link
            to={`/u/${conversation.username}`}
            className="truncate text-sm font-semibold hover:text-accent"
          >
            {conversation.display_name || conversation.username}
          </Link>
          <p className="text-xs text-muted">
            {isOnline(conversation.last_seen_at) ? "online" : "offline"}
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <p className="py-6 sm:py-10 text-center text-sm text-muted">
            No messages yet. Say something.
          </p>
        )}

        {messages.map((message) => {
          const mine = message.sender_id === myId;
          return (
            <div
              key={message.id}
              className={"flex " + (mine ? "justify-end" : "justify-start")}
            >
              <div
                className={
                  "max-w-[70%] notch px-3.5 py-2 text-sm " +
                  (mine
                    ? "bg-accent text-onaccent"
                    : "border border-line bg-surface")
                }
              >
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <p
                  className={
                    "mt-1 text-[10px] " + (mine ? "opacity-70" : "text-muted")
                  }
                >
                  {messageTime(message.created_at)}
                </p>
              </div>
            </div>
          );
        })}

        <div ref={bottom} />
      </div>

      <form
        onSubmit={submit}
        className="flex shrink-0 gap-2 border-t border-line px-5 py-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          placeholder={`Message ${conversation.display_name || conversation.username}`}
          className="flex-1 notch-md border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </section>
  );
}
