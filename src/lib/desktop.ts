import { isDesktopApp } from "./platform";

/**
 * Notifications that reach you when Pentra isn't the window you're
 * looking at.
 *
 * THE PROBLEM THIS SOLVES. The bell only works while somebody is
 * looking at it. A session starting in an hour, a friend request, a
 * message — all of it waited until you next opened the app, which for
 * something you use *while playing something else* is close to
 * useless. Settings admitted as much in writing.
 *
 * HOW IT WORKS. The desktop app keeps running when you close the
 * window: the X hides it to the tray instead of quitting (see
 * src-tauri/src/lib.rs). The webview stays alive, so the realtime
 * subscription and the reminder poll carry on exactly as before, and
 * anything that would have lit up the bell now also raises a Windows
 * notification. Nothing new had to be invented on the server — this is
 * the same notification stream, pointed somewhere else.
 *
 * WHAT IT DOESN'T DO. Quit Pentra properly and nothing arrives, the
 * same as any desktop app. Real push — notifications on a machine where
 * the app isn't running at all — needs a server that can reach out to
 * the device, which is a different piece of work.
 *
 * In a browser every function here is a no-op. None of the Tauri
 * modules are imported until a desktop-only path actually runs, so the
 * web bundle never pulls them in.
 */

/* ---------- preferences, stored per machine ---------- */

// Per device rather than per account, on purpose. "Notify me on the PC
// I game on but not the laptop" is an ordinary thing to want, and it
// would be strange for one to silently change the other. The same
// reasoning the sound toggle already uses.
const SHOW_KEY = "pentra.desktopNotifications";
const TRAY_KEY = "pentra.closeToTray";

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    // Private windows throw rather than no-op.
    return fallback;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* Nothing to do. The preference just won't survive a restart. */
  }
}

export function notificationsEnabled(): boolean {
  return readFlag(SHOW_KEY, true);
}

export function setNotificationsEnabled(value: boolean) {
  writeFlag(SHOW_KEY, value);
  if (value) void ensurePermission();
}

export function closeToTray(): boolean {
  return readFlag(TRAY_KEY, true);
}

export async function setCloseToTray(value: boolean) {
  writeFlag(TRAY_KEY, value);
  await pushCloseToTray();
}

/* ---------- permission ---------- */

// Windows only asks once, and the answer sticks for the installed app.
// Cached so a burst of notifications doesn't mean a burst of checks.
let granted: boolean | null = null;

export async function ensurePermission(): Promise<boolean> {
  if (!isDesktopApp()) return false;
  if (granted !== null) return granted;

  try {
    const { isPermissionGranted, requestPermission } = await import(
      "@tauri-apps/plugin-notification"
    );
    granted = (await isPermissionGranted())
      ? true
      : (await requestPermission()) === "granted";
  } catch {
    granted = false;
  }
  return granted;
}

/* ---------- sending ---------- */

/**
 * At most this many Windows notifications from one batch.
 *
 * Coming back to the machine after a weekend can turn up a dozen at
 * once, and a dozen toasts stacking up is something you dismiss rather
 * than read. Whoever is sending them summarises the rest in one.
 */
export const MAX_TOASTS = 3;

/**
 * Raise a Windows notification, if this is the desktop app, if they're
 * switched on, and if the window isn't already in front of the person.
 *
 * That last check is the one that matters. Popping a toast for a
 * message you are watching arrive is the behaviour that makes people
 * turn notifications off, and `document.hasFocus()` answers it without
 * a Tauri call or an extra permission.
 */
export async function notify(title: string, body: string): Promise<void> {
  if (!isDesktopApp()) return;
  if (!notificationsEnabled()) return;
  if (isWindowInFront()) return;
  if (!(await ensurePermission())) return;

  try {
    const { sendNotification } = await import("@tauri-apps/plugin-notification");
    sendNotification({ title, body: trim(body) });
  } catch {
    /* A notification that fails to send is not worth interrupting
       anything over. The bell still has it. */
  }
}

/** True when Pentra is the window being looked at right now. */
export function isWindowInFront(): boolean {
  try {
    return document.visibilityState === "visible" && document.hasFocus();
  } catch {
    return false;
  }
}

/**
 * Windows truncates a long toast body anyway, and mid-sentence is a
 * worse place to stop than a deliberate one.
 */
function trim(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

/* ---------- tray ---------- */

let lastUnread = -1;

// Two independent things are unread-able — the bell and the message
// list — and the tray shows one number. Each reports its own, and the
// tooltip is the sum. Without somewhere to add them up, whichever
// rendered last would overwrite the other and the count would flicker
// between them.
const counts: Record<"bell" | "messages", number> = { bell: 0, messages: 0 };

/**
 * Report one source's unread count. The tray tooltip follows the total.
 *
 * Safe to call from a render path: it does nothing unless the total
 * actually moved, which is far less often than these components render.
 */
export function reportUnread(source: "bell" | "messages", count: number) {
  counts[source] = Math.max(0, Math.floor(count) || 0);
  void setTrayUnread(counts.bell + counts.messages);
}

async function setTrayUnread(count: number): Promise<void> {
  if (!isDesktopApp()) return;
  if (count === lastUnread) return;
  lastUnread = count;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_unread", { count });
  } catch {
    /* Cosmetic. Not worth surfacing. */
  }
}

/**
 * Bring the window back to the front.
 *
 * Nothing calls this yet. It was meant for clicking a Windows toast,
 * which turns out not to be possible with this notification plugin —
 * the desktop side never emits the event `onAction()` waits for, so
 * that listener would sit there forever. Left in place because it is
 * two lines and the first "jump to this conversation" feature will
 * want it.
 */
export async function focusApp(): Promise<void> {
  if (!isDesktopApp()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("focus_app");
  } catch {
    /* Ignored. */
  }
}

async function pushCloseToTray(): Promise<void> {
  if (!isDesktopApp()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_close_to_tray", { enabled: closeToTray() });
  } catch {
    /* The Rust side defaults to hiding, which is the common case. */
  }
}

/* ---------- start with Windows ---------- */

export async function autostartEnabled(): Promise<boolean> {
  if (!isDesktopApp()) return false;
  try {
    const { isEnabled } = await import("@tauri-apps/plugin-autostart");
    return await isEnabled();
  } catch {
    return false;
  }
}

export async function setAutostart(value: boolean): Promise<void> {
  if (!isDesktopApp()) return;
  const { enable, disable } = await import("@tauri-apps/plugin-autostart");
  // Deliberately not caught: this one is a switch somebody just moved,
  // so Settings needs to know it failed and put the switch back.
  if (value) await enable();
  else await disable();
}

/* ---------- startup ---------- */

let started = false;

/**
 * Called once when the app loads. Tells the native side what the close
 * button should do, and asks for notification permission up front so
 * the first friend request isn't also the first permission prompt.
 */
export function initDesktop() {
  if (started || !isDesktopApp()) return;
  started = true;

  void pushCloseToTray();
  if (notificationsEnabled()) void ensurePermission();
}
