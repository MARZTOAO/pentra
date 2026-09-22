import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { getConversations, type Message } from "../lib/chat";
import { Avatar } from "./Avatar";
import { play } from "../lib/sound";
import { notify, reportUnread } from "../lib/desktop";

type Toast = {
  id: number;
  conversationId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarPreset: string | null;
  body: string;
};

type NotificationState = {
  /** Total unread across every conversation. Drives the sidebar badge. */
  unread: number;
  refresh: () => void;
};

const Ctx = createContext<NotificationState>({ unread: 0, refresh: () => {} });

export function useNotifications() {
  return useContext(Ctx);
}

/** The conversation id in /messages/12, or null anywhere else. */
function openConversationId(pathname: string): number | null {
  const match = pathname.match(/^\/messages\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

/**
 * Watches for incoming messages anywhere in the app.
 *
 * The subscription has no conversation filter on purpose: row-level
 * security already limits these events to conversations you're part of,
 * so "everything I'm allowed to see" is exactly the right set.
 *
 * It's set up once and left alone. Current location is read through a
 * ref rather than a dependency — putting `location` in the deps would
 * tear down and rebuild the channel on every navigation, which drops
 * events during the gap and leaves toasts stranded.
 */
export function Notifications({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  /** Message ids already sent to Windows, so none goes twice. */
  const notified = useRef<Set<number>>(new Set());

  const openId = openConversationId(location.pathname);

  // Kept current for the subscription callback to read.
  const openIdRef = useRef<number | null>(openId);
  useEffect(() => {
    openIdRef.current = openId;
  }, [openId]);

  const refresh = useCallback(async () => {
    if (!user) {
      setUnread(0);
      return;
    }
    const rows = await getConversations();
    setUnread(rows.reduce((total, row) => total + Number(row.unread ?? 0), 0));
  }, [user]);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh, location.pathname]);

  // Half of the tray tooltip's number; the bell reports the other half.
  // Does nothing in a browser.
  useEffect(() => {
    reportUnread("messages", unread);
  }, [unread]);

  // Opening a thread clears any toast for it, however you got there —
  // the toast itself, the sidebar, or a link from a profile.
  useEffect(() => {
    if (openId === null) return;
    setToasts((current) => current.filter((t) => t.conversationId !== openId));
  }, [openId]);

  useEffect(() => {
    if (!user) return;

    const timers: number[] = [];

    const channel = supabase
      .channel("incoming-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const message = payload.new as Message;

          // Our own messages aren't news.
          if (message.sender_id === user.id) return;

          refreshRef.current();

          // Don't interrupt someone already reading that thread.
          if (openIdRef.current === message.conversation_id) return;

          const { data } = await supabase
            .from("profiles")
            .select("username, display_name, avatar_url, avatar_preset")
            .eq("id", message.sender_id)
            .single();

          if (!data) return;

          // They may have opened the thread while that query was in
          // flight. Check again before showing anything.
          if (openIdRef.current === message.conversation_id) return;

          const toast: Toast = {
            id: message.id,
            conversationId: message.conversation_id,
            username: data.username,
            displayName: data.display_name,
            avatarUrl: data.avatar_url,
            avatarPreset: data.avatar_preset,
            body: message.body,
          };

          // Guarded by its own set rather than by the toast list.
          // React may run the updater below more than once for a single
          // event, and Supabase can redeliver one on a reconnect —
          // either would be a second toast for the same message.
          if (!notified.current.has(message.id)) {
            notified.current.add(message.id);
            void notify(data.display_name || data.username, message.body);
          }

          setToasts((current) => {
            // Already showing it — a duplicate event, not a new message.
            if (current.some((t) => t.id === toast.id)) return current;
            play("message");
            return [...current.slice(-2), toast];
          });

          const timer = window.setTimeout(() => {
            setToasts((current) => current.filter((t) => t.id !== toast.id));
          }, 6000);

          timers.push(timer);
        },
      )
      .subscribe();

    return () => {
      timers.forEach(clearTimeout);
      supabase.removeChannel(channel);
    };
  }, [user]);

  function dismiss(id: number) {
    setToasts((current) => current.filter((t) => t.id !== id));
  }

  return (
    <Ctx.Provider value={{ unread, refresh }}>
      {children}

      {/* Stacked bottom-right, newest at the bottom. */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="float-shadow pointer-events-auto">
          <div
            className="flex w-full items-start gap-3 notch border border-line bg-surface p-3 transition hover:border-accent"
          >
            <button
              onClick={() => {
                dismiss(toast.id);
                navigate(`/messages/${toast.conversationId}`);
              }}
              className="flex min-w-0 flex-1 items-start gap-3 text-left"
            >
              <Avatar
                of={{
                  username: toast.username,
                  avatar_url: toast.avatarUrl,
                  avatar_preset: toast.avatarPreset,
                }}
                size={36}
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {toast.displayName || toast.username}
                </p>
                <p className="line-clamp-2 text-xs text-muted">{toast.body}</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="shrink-0 rounded p-1 text-muted transition hover:text-ink"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
