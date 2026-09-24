import { isDesktopApp } from "./platform";

/**
 * Keeping the desktop app current.
 *
 * The browser version updates itself: every push to main is live on
 * Vercel a minute later. The desktop app carries its own copy of the
 * same code, so it has to be told. This is how it's told.
 *
 * HOW A RELEASE HAPPENS. The same push that deploys the website also
 * runs .github/workflows/release.yml, which builds the installer,
 * signs it, and publishes a GitHub Release with a `latest.json`
 * beside it. The app asks for that file at launch, every half hour,
 * and when its window comes back; if the version in it is newer than
 * the one running, it
 * offers to install it. Both sides of the app move together, from
 * one push.
 *
 * WHY IT ASKS RATHER THAN JUST DOING IT. On Windows, installing means
 * the app closes, the installer runs, and the app reopens. Doing that
 * unannounced in the middle of a conversation is how you lose a
 * message someone was typing. So it downloads nothing until asked,
 * and asks in a corner rather than a modal. Steam does the same.
 *
 * SAFETY. Every installer is signed with a key only the release
 * workflow has, and the app checks that signature against the public
 * key baked into tauri.conf.json before it will run anything. A
 * tampered download, or a fake latest.json, is refused. That is the
 * updater's own check, not something here — this file only drives
 * the UI.
 *
 * In a browser every function here is a no-op that resolves at once.
 */

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current"; version: string }
  | {
      kind: "available";
      version: string;
      notes: string | null;
      /** When that release was published, if the updater says. */
      date: string | null;
    }
  | { kind: "downloading"; version: string; percent: number | null }
  | { kind: "installing"; version: string }
  | { kind: "error"; message: string };

type Listener = (s: UpdateState) => void;

let state: UpdateState = { kind: "idle" };
const listeners = new Set<Listener>();

function set(next: UpdateState) {
  state = next;
  listeners.forEach((l) => l(state));
}

export function getUpdateState(): UpdateState {
  return state;
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/* ------------------------------------------------------------------ */

type Update = Awaited<ReturnType<typeof import("@tauri-apps/plugin-updater").check>>;

let pending: NonNullable<Update> | null = null;

/** When the last check started, for the throttle below. */
let lastCheck = 0;

/**
 * The version the person pressed "Later" on. Background checks don't
 * offer it again this session — with checks every half hour, "Later"
 * would otherwise mean "in thirty minutes". A NEWER version is offered
 * as normal, and pressing "Check now" in Settings always shows it.
 */
let dismissedVersion: string | null = null;

/**
 * Ask GitHub whether there's a newer build. Cheap: one small JSON
 * file. Resolves to the new version string, or null.
 *
 * `quiet` is for the automatic checks. They never flash a "checking"
 * state (which would blank a card the person is reading), never
 * replace what's on screen with an error, and respect "Later". The
 * Settings button is the loud version: it shows checking, shows
 * errors, and always shows what it found.
 */
export async function checkForUpdate(
  { quiet = false }: { quiet?: boolean } = {},
): Promise<string | null> {
  if (!isDesktopApp()) return null;
  if (state.kind === "downloading" || state.kind === "installing") return null;

  lastCheck = Date.now();
  if (!quiet) set({ kind: "checking" });

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (!update) {
      // Nothing newer. Leave an offer that's already on screen alone.
      if (state.kind !== "available") {
        const { getVersion } = await import("@tauri-apps/api/app");
        set({ kind: "current", version: await getVersion() });
      }
      return null;
    }

    pending = update;

    if (quiet && update.version === dismissedVersion) {
      return update.version;
    }

    set({
      kind: "available",
      version: update.version,
      notes: update.body?.trim() || null,
      date: update.date ?? null,
    });
    return update.version;
  } catch (e) {
    // Offline, GitHub down, no release yet: none of these are worth
    // a dialog. The next check will try again.
    if (!quiet) set({ kind: "error", message: describe(e) });
    return null;
  }
}

/**
 * Download, verify, install, restart. Only ever called from a button
 * the person pressed.
 */
export async function installUpdate(): Promise<void> {
  if (!pending) return;
  const update = pending;

  let total: number | null = null;
  let got = 0;
  set({ kind: "downloading", version: update.version, percent: null });

  try {
    await update.downloadAndInstall((ev) => {
      if (ev.event === "Started") {
        total = ev.data.contentLength ?? null;
      } else if (ev.event === "Progress") {
        got += ev.data.chunkLength;
        set({
          kind: "downloading",
          version: update.version,
          percent: total ? Math.min(100, Math.round((got / total) * 100)) : null,
        });
      } else if (ev.event === "Finished") {
        set({ kind: "installing", version: update.version });
      }
    });

    // On Windows the installer has already closed us by the time we
    // get here. On Mac we're still running the old binary, and this
    // swaps it for the new one.
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    pending = null;
    set({ kind: "error", message: describe(e) });
  }
}

/**
 * "Later". Hides the offer for this session — background checks won't
 * bring the same version back. Next launch, or a newer version, asks
 * again.
 */
export function dismissUpdate() {
  if (state.kind === "available") dismissedVersion = state.version;
  if (state.kind === "available" || state.kind === "error") {
    set({ kind: "idle" });
  }
}

/* ------------------------------------------------------------------ */

/** Background check interval. Was six hours; that meant an app left
    in the tray could sit on an old build for most of a day. */
const EVERY = 30 * 60 * 1000;

/** Never two checks closer together than this, however often the
    window is shown or focused. */
const MIN_GAP = 10 * 60 * 1000;

let started = false;

/**
 * Called once at startup. Waits a few seconds so the update check
 * never competes with the app actually loading, then checks:
 *
 *   - every 30 minutes, and
 *   - whenever the window comes back — opened from the tray, restored,
 *     or clicked into — which is exactly when someone is about to look
 *     at it. Throttled to once per 10 minutes, so alt-tabbing in and
 *     out doesn't mean a request each time.
 *
 * Each check fetches one small file (latest.json) from GitHub's release
 * downloads — not the rate-limited GitHub API — so this costs nothing.
 */
export function startUpdateChecks() {
  if (started || !isDesktopApp()) return;
  started = true;

  const quietCheck = () => void checkForUpdate({ quiet: true });

  const onReturn = () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastCheck < MIN_GAP) return;
    quietCheck();
  };

  window.setTimeout(() => {
    quietCheck();
    window.setInterval(quietCheck, EVERY);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
  }, 5000);
}

function describe(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/Could not fetch a valid release JSON|404/i.test(raw)) {
    return "No release published yet.";
  }
  if (/signature/i.test(raw)) {
    return "The download didn't pass its signature check, so it wasn't installed.";
  }
  if (/network|fetch|dns|connect/i.test(raw)) {
    return "Couldn't reach the update server.";
  }
  return raw.length > 160 ? raw.slice(0, 157) + "…" : raw;
}
