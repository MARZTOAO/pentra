import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { Anchored } from "./Anchored";
import { Avatar } from "./Avatar";
import {
  getNotifications,
  markNotificationsRead,
  notificationAge,
  notificationLink,
  notificationText,
  notificationTitle,
  syncSessionReminders,
  POLL_MS,
  type AppNotification,
} from "../lib/notifications";
import { play } from "../lib/sound";
import { notify, reportUnread, MAX_TOASTS } from "../lib/desktop";

/**
 * The bell in the top bar.
 *
 * Subscribes AND polls, because the two halves arrive differently.
 *
 * Four of the six kinds are written by database triggers the moment
 * something happens, and those come through realtime instantly. The
 * two session reminders are derived from the clock — nothing happens
 * in the database when a session becomes an hour away — so they still
 * need the poll, which is also what calls sync_session_reminders().
 *
 * Polling alone was the first version, and it was wrong: a friend
 * request could sit for up to a minute before appearing, which reads
 * as "it only works if I refresh". One minute is far past the point
 * where someone decides a feature is broken.
 */
export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const trigger = useRef<HTMLButtonElement>(null);

  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  // Ids already seen, so a poll only makes a sound for something that
  // genuinely just arrived. Without this the first load would announce
  // a week of unread notifications at once, and every poll would
  // re-announce anything still unread.
  const known = useRef<Set<number> | null>(null);

  const unread = items.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }
    await syncSessionReminders();
    const rows = await getNotifications();
    setItems(rows);

    // The first load only records what is already there. Announcing
    // history is noise, not news.
    if (known.current === null) {
      known.current = new Set(rows.map((n) => n.id));
      return;
    }

    const fresh = rows.filter((n) => !known.current!.has(n.id));
    for (const n of rows) known.current.add(n.id);

    if (fresh.length > 0) {
      // A friend request gets its own sound; everything else shares
      // one. One sound per poll, however many arrived — three beeps on
      // top of each other is a noise, not three notifications.
      play(
        fresh.some((n) => n.kind === "friend_request")
          ? "friendRequest"
          : "notification",
      );

      // And out to Windows, if this is the desktop app and the window
      // isn't already in front of them. `notify` decides that; calling
      // it in a browser does nothing at all.
      for (const n of fresh.slice(0, MAX_TOASTS)) {
        void notify(notificationTitle(n), notificationText(n));
      }
      if (fresh.length > MAX_TOASTS) {
        const rest = fresh.length - MAX_TOASTS;
        void notify("Pentra", `and ${rest} more notification${rest === 1 ? "" : "s"}.`);
      }
    }
  }, [user]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // The tray tooltip adds this to the unread message count. Desktop
  // only; a no-op everywhere else.
  useEffect(() => {
    reportUnread("bell", unread);
  }, [unread]);

  // Trigger-written notifications arrive the instant they are created.
  // Row-level security applies to realtime too, so this only ever
  // receives rows addressed to this account — the filter is belt and
  // braces, not the thing keeping other people's bells private.
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("my-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Refetch rather than append the payload: get_notifications()
          // joins the actor and the post, and a raw row carries neither,
          // so appending it would render "Someone tagged you".
          load();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  // Opening the list marks everything read — the same bargain every
  // notification bell makes. The local update is optimistic so the
  // badge clears on the click rather than a round trip later.
  async function toggle() {
    const next = !open;
    setOpen(next);

    if (next && unread > 0) {
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((n) => (n.read_at ? n : { ...n, read_at: now })),
      );
      await markNotificationsRead();
    }
  }

  function go(n: AppNotification) {
    setOpen(false);
    navigate(notificationLink(n));
  }

  if (!user) return null;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
        className={
          "relative p-2 transition " +
          (open ? "text-accent" : "text-muted hover:text-ink")
        }
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>

        {unread > 0 && (
          <span className="numeric absolute right-0.5 top-0.5 bg-accent px-1 text-[9px] font-bold text-onaccent">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <Anchored
          anchorRef={trigger}
          onClose={() => setOpen(false)}
          width={320}
          align="right"
        >
          <div className="float-shadow">
            <div className="notch-md overflow-hidden border border-line bg-surface">
              <p className="label-wide border-b border-line px-4 py-2.5 text-muted">
                Notifications
              </p>

              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">
                  Nothing yet. Friend requests and session reminders land here.
                </p>
              ) : (
                <ul className="max-h-96 overflow-y-auto">
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => go(n)}
                        className="flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition last:border-b-0 hover:bg-surface-2"
                      >
                        {n.username ? (
                          <Avatar
                            of={{
                              username: n.username,
                              avatar_url: n.avatar_url,
                              avatar_preset: n.avatar_preset,
                            }}
                            size={32}
                            className="mt-0.5 shrink-0"
                          />
                        ) : (
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center notch-sm bg-accent-dim text-accent">
                            <Clock />
                          </span>
                        )}

                        <span className="min-w-0 flex-1">
                          <span
                            className={
                              "block text-sm " +
                              (n.read_at ? "text-muted" : "font-medium text-ink")
                            }
                          >
                            {notificationText(n)}
                          </span>
                          <span className="numeric mt-0.5 block text-[11px] text-muted">
                            {notificationAge(n.created_at)}
                          </span>
                        </span>

                        {/* An unread marker that isn't only colour. */}
                        {!n.read_at && (
                          <span
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                            aria-label="unread"
                          />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Anchored>
      )}
    </>
  );
}

function Clock() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
