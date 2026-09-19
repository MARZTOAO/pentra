import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import {
  getConversations,
  getConversationMembers,
  conversationName,
  getMessages,
  sendMessage,
  markRead,
  subscribeToMessages,
  messageTime,
  deleteMessage,
  leaveConversation,
  type Conversation,
  type ConversationMember,
  type Message,
} from "../lib/chat";
import {
  getPresenceMap,
  presenceOf,
  PRESENCE_LABEL,
  type PresenceState,
} from "../lib/presence";
import { StatusDot } from "../components/StatusDot";
import { Confirm } from "../components/SafetyMenu";
import { Avatar } from "../components/Avatar";
import { useNotifications } from "../components/Notifications";
import { FullScreenLoader } from "../components/ui";

/** Folds the batched presence lookup into a conversation row. */
function stateOf(
  c: { other_id: string | null; last_seen_at: string | null },
  map: Record<string, string>,
): PresenceState {
  return presenceOf({
    presence: c.other_id ? map[c.other_id] : undefined,
    last_seen_at: c.last_seen_at,
  });
}

export default function Messages() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  // get_conversations predates presence; one batched lookup fills it in.
  const [presence, setPresence] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const activeId = id ? Number(id) : null;
  const active = conversations.find((c) => c.conversation_id === activeId);

  const load = useCallback(async () => {
    const list = await getConversations();
    setConversations(list);
    setPresence(
      await getPresenceMap(
        list.map((c) => c.other_id).filter((id): id is string => Boolean(id)),
      ),
    );
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
              {/* A session chat has no single other person, so it gets a
                  notched square with the player count instead of a round
                  avatar. The shape difference is the point: you can tell
                  the two kinds apart without reading anything. */}
              {c.kind === "session" ? (
                <div className="notch-sm flex h-10 w-10 shrink-0 items-center justify-center bg-accent-dim text-accent">
                  <span className="numeric text-sm font-bold">
                    {c.member_count}
                  </span>
                </div>
              ) : (
                <div className="relative shrink-0">
                  <Avatar of={c} size={40} />
                  {stateOf(c, presence) !== "offline" && (
                    <span className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-bg">
                      <StatusDot state={stateOf(c, presence)} size={9} />
                    </span>
                  )}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {conversationName(c)}
                </p>
                <p className="truncate text-xs text-muted">
                  {c.last_message
                    ? (c.last_from_me ? "You: " : "") + c.last_message
                    : c.kind === "session"
                      ? "Session chat — say hello"
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
          state={stateOf(active, presence)}
          myId={user.id}
          onSent={load}
          onLeft={() => {
            load();
            navigate("/messages");
          }}
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
  state,
  myId,
  onSent,
  onLeft,
}: {
  conversation: Conversation;
  /** Passed in rather than looked up again — the list already fetched it. */
  state: PresenceState;
  myId: string;
  onSent: () => void;
  /** Called after deleting the chat, to refresh the list and step back. */
  onLeft: () => void;
}) {
  // Marking a thread read has to update the sidebar badge too, not just
  // this screen's own list.
  const { refresh: refreshBadge } = useNotifications();
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<ConversationMember[]>([]);
  // Deleting is one click and can't be undone, so both ask first.
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  // Only group chats need a roster; a DM's "members" are already on the
  // conversation. Refetched per conversation so leaving a session is
  // reflected the next time anyone opens it.
  useEffect(() => {
    if (conversation.kind !== "session") {
      setMembers([]);
      return;
    }
    getConversationMembers(conversation.conversation_id).then(setMembers);
  }, [conversation.conversation_id, conversation.kind]);

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
        {conversation.kind === "session" ? (
          <>
            <div className="notch-sm flex h-9 w-9 shrink-0 items-center justify-center bg-accent-dim text-accent">
              <span className="numeric text-sm font-bold">
                {conversation.member_count}
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {conversationName(conversation)}
              </p>
              {/* Names rather than a count: in a group you want to know
                  who is actually here before you say anything. */}
              <p className="truncate text-xs text-muted">
                {members.length
                  ? members
                      .map((m) => m.display_name || m.username)
                      .join(", ")
                  : "Session chat"}
              </p>
            </div>
          </>
        ) : (
          <>
            <Avatar of={conversation} size={36} />
            <div className="min-w-0">
              <Link
                to={`/u/${conversation.username}`}
                className="truncate text-sm font-semibold hover:text-accent"
              >
                {conversation.display_name || conversation.username}
              </Link>
              <p className="text-xs text-muted">
                {PRESENCE_LABEL[state]}
              </p>
            </div>

            {/* Only on DMs. A session chat's members are the session
                roster, so the database refuses to let you leave one —
                offering a button that always errors would be worse
                than not offering it. */}
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              aria-label="Delete this chat"
              title="Delete this chat"
              className="label-wide ml-auto shrink-0 px-2.5 py-1.5 text-muted transition hover:text-danger"
            >
              Delete
            </button>
          </>
        )}
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <p className="py-6 sm:py-10 text-center text-sm text-muted">
            No messages yet. Say something.
          </p>
        )}

        {messages.map((message) => {
          const mine = message.sender_id === myId;
          const gone = Boolean(message.deleted_at);

          return (
            <div
              key={message.id}
              className={
                "group flex items-center gap-2 " +
                (mine ? "justify-end" : "justify-start")
              }
            >
              {/* Delete sits outside the bubble, on the side away from the
                  edge, and only on your own messages.

                  Visible at rest rather than on hover. A phone has no
                  hover, so a group-hover control never appears there at
                  all — and on desktop it leaves people hunting for a
                  button they've been told exists. It brightens on hover
                  instead. */}
              {mine && !gone && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(message.id)}
                  aria-label="Delete message"
                  title="Delete message"
                  className="shrink-0 p-1.5 text-muted opacity-60 transition hover:text-danger hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}

              <div
                className={
                  "max-w-[70%] notch px-3.5 py-2 text-sm " +
                  (gone
                    ? "border border-dashed border-line text-muted"
                    : mine
                      ? "bg-accent text-onaccent"
                      : "border border-line bg-surface")
                }
              >
                <p
                  className={
                    "whitespace-pre-wrap break-words " + (gone ? "italic" : "")
                  }
                >
                  {gone ? "Message deleted" : message.body}
                </p>
                <p
                  className={
                    "mt-1 text-[10px] " +
                    (gone ? "text-muted" : mine ? "opacity-70" : "text-muted")
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

      {confirmLeave && (
        <Confirm
          title="Delete this chat?"
          body="It disappears from your Messages. They keep their copy, and if they write again you'll only see what they send from now on."
          confirmLabel="Delete"
          onCancel={() => setConfirmLeave(false)}
          onConfirm={async () => {
            setConfirmLeave(false);
            const { error } = await leaveConversation(
              conversation.conversation_id,
            );
            if (error) return;
            // The thread we're looking at no longer exists for us, so
            // go back to the list rather than sitting on a dead view.
            onLeft();
          }}
        />
      )}

      {confirmDelete !== null && (
        <Confirm
          title="Delete this message?"
          body="It will show as deleted for everyone in this conversation. You can't undo it."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const id = confirmDelete;
            setConfirmDelete(null);
            const { error } = await deleteMessage(id);
            if (error) return;

            // Patch in place rather than refetching: the thread stays
            // put instead of jumping to the bottom mid-conversation.
            setMessages((current) =>
              current.map((m) =>
                m.id === id
                  ? { ...m, body: "Message deleted", deleted_at: new Date().toISOString() }
                  : m,
              ),
            );
            onSent();
          }}
        />
      )}

      <form
        onSubmit={submit}
        className="flex shrink-0 gap-2 border-t border-line px-5 py-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          placeholder={
            conversation.kind === "session"
              ? `Message the ${conversationName(conversation)} session`
              : `Message ${conversationName(conversation)}`
          }
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
