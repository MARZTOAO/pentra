import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { Anchored } from "./Anchored";
import { Avatar } from "./Avatar";
import {
  getNotifications,
  markNotificationsRead,
  notificationAge,
  notificationLink,
  notificationText,
  syncSessionReminders,
  type AppNotification,
} from "../lib/notifications";
import { play } from "../lib/sound";

/** How often to look for new ones while the app is open. */
const POLL_MS = 60_000;

/**
 * The bell in the top bar.
 *
 * Polls rather than subscribing. Notifications arrive from five
 * different places — three triggers and two derived from the clock —
 * and a realtime subscription would only ever see the trigger-written
 * ones, so the session reminders would still need a poll. One poll
 * that covers everything beats a subscription plus a poll that has to
 * agree with it.
 *
 * Every poll also asks the database to materialise any session
 * reminders that have come due, which is what makes "an hour before"
 * work without a scheduled job anywhere.
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
    }
  }, [user]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

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
