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

  // The plugin's own commands, called directly. Its JavaScript wrapper
  // consults the browser's `window.Notification.permission` first, and
  // WebView2 answers "denied" to that regardless of what Windows would
  // say — which made this return false and silenced every toast.
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const already = (await invoke("plugin:notification|is_permission_granted")) as boolean | null;
    granted =
      already === true ||
      ((await invoke("plugin:notification|request_permission")) as string) === "granted";
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
  if (await isWindowInFront()) return;
  await send(title, body);
}

/**
 * The Windows toast itself, with the "is anyone looking" check left
 * out. notify() and the Settings test button both end up here.
 *
 * @returns null when Windows accepted it, otherwise a sentence.
 */
async function send(title: string, body: string): Promise<string | null> {
  if (!(await ensurePermission())) {
    return "Windows hasn't given Pentra permission to show notifications.";
  }
  try {
    // Straight to the command. The wrapper (`sendNotification`) fires
    // and forgets, so a failure there is invisible; this one is awaited
    // and reports back.
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("plugin:notification|notify", { options: { title, body: trim(body) } });
    return null;
  } catch (e) {
    // A notification that fails to send is not worth interrupting
    // anything over — the bell still has it — but the test button
    // wants to know what Windows said.
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Settings → "Send a test notification". Skips the in-front check on
 * purpose (you are, by definition, looking at Settings) so it answers
 * the only question that matters: does a toast from Pentra reach
 * Windows on this machine at all?
 *
 * @returns null when it was sent, or the reason it wasn't.
 */
export async function testNotification(): Promise<string | null> {
  if (!isDesktopApp()) return "Only the desktop app can show Windows notifications.";
  if (!notificationsEnabled()) return "Windows notifications are switched off above.";
  return send("Pentra", "This is what a notification looks like. If you can read this, they work.");
}

/**
 * True when Pentra is the window being looked at right now.
 *
 * Asks Windows, through Tauri, rather than the page. The page's own
 * answer — `document.visibilityState` and `document.hasFocus()` — is
 * not trustworthy here: the window is hidden with ShowWindow(SW_HIDE),
 * and WebView2 isn't told, so a window sitting in the tray can keep
 * reporting itself visible and focused. Every toast was then being
 * suppressed as "they're already looking at it". (Found 2026-10-03:
 * sound and tray dot arrived, no toast ever did.)
 *
 * If the native calls fail, this says "not in front": a toast you
 * didn't need beats one you never got.
 */
export async function isWindowInFront(): Promise<boolean> {
  if (!isDesktopApp()) {
    try {
      return document.visibilityState === "visible" && document.hasFocus();
    } catch {
      return false;
    }
  }
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    const [visible, minimized, focused] = await Promise.all([
      w.isVisible(),
      w.isMinimized(),
      w.isFocused(),
    ]);
    return visible && !minimized && focused;
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
