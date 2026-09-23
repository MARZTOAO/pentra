import { supabase } from "./supabase";

/**
 * The bell, and what feeds it.
 *
 * Ten kinds. Eight are written by database triggers the moment the
 * thing happens; two are materialised by sync_session_reminders()
 * when the app asks, because nothing happens in the database an hour
 * before a session — the hour simply arrives. See
 * supabase/33_notifications.sql, 34_mentions.sql, 39_comments.sql,
 * 41_live_sessions_and_comments.sql and 42_session_invites.sql.
 */

/**
 * How often each watcher sweeps for what realtime may have missed.
 *
 * Used by the bell AND by the message watcher, from one place so they
 * can't drift apart. Realtime is the fast path and almost always the
 * one that delivers; this is the net underneath it, for the seconds
 * after a WebSocket drops and before it reconnects, and for the two
 * session reminders that no database write ever announces.
 */
export const POLL_MS = 60_000;

export type NotificationKind =
  | "friend_request"
  | "friend_accepted"
  | "session_day"
  | "session_hour"
  | "friend_lfg"
  | "post_mention"
  | "post_comment"
  | "session_joined"
  | "session_left"
  | "session_invite";

export type AppNotification = {
  id: number;
  kind: NotificationKind;
  created_at: string;
  read_at: string | null;
  /** Who caused it. Null if the system decided on its own. */
  actor_id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  /** The session or post it's about. */
  post_id: number | null;
  game_name: string | null;
  starts_at: string | null;
};

export type NotificationSettings = {
  friend_requests: boolean;
  friend_accepted: boolean;
  session_reminders: boolean;
  friend_lfg: boolean;
  post_mentions: boolean;
  post_comments: boolean;
  session_players: boolean;
  session_invites: boolean;
};

export const DEFAULT_SETTINGS: NotificationSettings = {
  friend_requests: true,
  friend_accepted: true,
  session_reminders: true,
  friend_lfg: true,
  post_mentions: true,
  post_comments: true,
  session_players: true,
  session_invites: true,
};

/** What each toggle says on the settings screen. */
export const SETTING_LABELS: {
  key: keyof NotificationSettings;
  label: string;
  hint: string;
}[] = [
  {
    key: "friend_requests",
    label: "Friend requests",
    hint: "When somebody asks to be your friend.",
  },
  {
    key: "friend_accepted",
    label: "Requests accepted",
    hint: "When somebody says yes to a request you sent.",
  },
  {
    key: "session_reminders",
    label: "Session reminders",
    hint: "The day before and an hour before a session you've joined.",
  },
  {
    key: "friend_lfg",
    label: "Friends looking for players",
    hint: "When a friend posts a session for a game one of you has in a Top 5.",
  },
  {
    key: "post_mentions",
    label: "Tagged in a post",
    hint: "When a friend puts your name in something they posted.",
  },
  {
    key: "post_comments",
    label: "Comments on your posts",
    hint: "When somebody replies to something you posted.",
  },
  {
    key: "session_players",
    label: "Players joining and leaving",
    hint: "When somebody joins or drops out of a session you're hosting.",
  },
  {
    key: "session_invites",
    label: "Session invites",
    hint: "When a friend invites you into a session they're in.",
  },
];

/** Where clicking a notification should take you. */
export function notificationLink(n: AppNotification): string {
  switch (n.kind) {
    case "friend_request":
      return "/friends";
    case "friend_accepted":
      return n.username ? `/u/${n.username}` : "/friends";
    // Straight to the post, not the screen it lives on. Landing on the
    // feed and being left to scroll for the thing you were told about
    // is fine with three posts and useless with three hundred.
    case "session_day":
    case "session_hour":
    case "friend_lfg":
    case "post_mention":
    case "post_comment":
    case "session_joined":
    case "session_left":
    case "session_invite":
      return n.post_id ? `/p/${n.post_id}` : "/home";
  }
}

/**
 * The sentence shown in the list.
 *
 * Built here rather than in the component so the bell and any future
 * toast can't drift apart in wording.
 */
export function notificationText(n: AppNotification): string {
  const who = n.display_name || n.username || "Someone";
  const game = n.game_name ?? "a game";

  switch (n.kind) {
    case "friend_request":
      return `${who} sent you a friend request.`;
    case "friend_accepted":
      return `${who} accepted your friend request.`;
    case "session_hour":
      return `Your ${game} session starts within the hour.`;
    case "session_day":
      return `Your ${game} session is coming up ${whenPhrase(n.starts_at)}.`;
    case "friend_lfg":
      return `${who} is looking for players for ${game}.`;
    case "post_mention":
      return `${who} tagged you in a post.`;
    case "post_comment":
      return `${who} commented on your post.`;
    // "your Helldivers 2 session", or just "your session" when the
    // post never named a game — "joined your a game session" is the
    // sort of sentence a default like `game` writes for you.
    case "session_joined":
      return `${who} joined ${sessionPhrase(n.game_name)}.`;
    case "session_left":
      return `${who} left ${sessionPhrase(n.game_name)}.`;
    // "their" rather than "your" — the inviter is often a player in
    // somebody else's session, not the host of one.
    case "session_invite":
      return n.game_name
        ? `${who} invited you to a ${n.game_name} session.`
        : `${who} invited you to a session.`;
  }
}

/**
 * The bold first line of a desktop notification.
 *
 * Separate from the sentence because a Windows toast reads as a
 * heading and a line under it, and "Barry sent you a friend request."
 * as a heading with nothing under it wastes the shape. Lives here for
 * the same reason notificationText does: the bell, the toast and
 * anything added later say the same words.
 */
export function notificationTitle(n: AppNotification): string {
  switch (n.kind) {
    case "friend_request":
      return "Friend request";
    case "friend_accepted":
      return "Friend request accepted";
    case "session_hour":
    case "session_day":
      return "Session reminder";
    case "friend_lfg":
      return "Looking for players";
    case "post_mention":
      return "You were tagged";
    case "post_comment":
      return "New comment";
    case "session_joined":
    case "session_left":
      return "Your session";
    case "session_invite":
      return "Session invite";
  }
}

function sessionPhrase(gameName: string | null): string {
  return gameName ? `your ${gameName} session` : "your session";
}

/** "tomorrow at 21:00", or "at 21:00" if it's still today. */
function whenPhrase(iso: string | null): string {
  if (!iso) return "soon";

  const date = new Date(iso);
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return date.toDateString() === tomorrow.toDateString()
    ? `tomorrow at ${time}`
    : `at ${time}`;
}

/** "just now", "12m", "3h", "5d". */
export function notificationAge(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

export async function getNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase.rpc("get_notifications", {
    max_results: 30,
  });
  if (error || !data) return [];
  return data as AppNotification[];
}

export async function markNotificationsRead() {
  return supabase.rpc("mark_notifications_read");
}

/**
 * Creates any session reminders that have come due.
 *
 * Safe to call as often as we like — a unique index in the database
 * does the deduplicating, so a repeat call writes nothing.
 */
export async function syncSessionReminders() {
  return supabase.rpc("sync_session_reminders");
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const { data, error } = await supabase
    .from("notification_settings")
    // One string literal, deliberately, however long it gets. The
    // Supabase client infers the row type from this argument, and a
    // concatenated expression is not a literal — split it across lines
    // with `+` and the inferred type collapses to GenericStringError,
    // which fails the build at the cast below.
    .select(
      "friend_requests, friend_accepted, session_reminders, friend_lfg, post_mentions, post_comments, session_players, session_invites",
    )
    .maybeSingle();

  // No row means nobody has changed anything yet, which is every
  // default — the same assumption the database makes.
  if (error || !data) return DEFAULT_SETTINGS;
  return data as NotificationSettings;
}

export async function saveNotificationSettings(
  userId: string,
  settings: NotificationSettings,
) {
  return supabase
    .from("notification_settings")
    .upsert(
      { user_id: userId, ...settings, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
}
