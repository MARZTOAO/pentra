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
 * beside it. The app asks for that file at launch and every few
 * hours; if the version in it is newer than the one running, it
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

/**
 * Ask GitHub whether there's a newer build. Cheap: one small JSON
 * file. Resolves to the new version string, or null.
 */
export async function checkForUpdate(): Promise<string | null> {
  if (!isDesktopApp()) return null;
  if (state.kind === "downloading" || state.kind === "installing") return null;

  set({ kind: "checking" });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (!update) {
      const { getVersion } = await import("@tauri-apps/api/app");
      set({ kind: "current", version: await getVersion() });
      return null;
    }

    pending = update;
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
    set({ kind: "error", message: describe(e) });
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

/** Hide the offer for this session. Next launch asks again. */
export function dismissUpdate() {
  if (state.kind === "available" || state.kind === "error") {
    set({ kind: "idle" });
  }
}

/* ------------------------------------------------------------------ */

const EVERY = 6 * 60 * 60 * 1000;
let started = false;

/**
 * Called once at startup. Waits a few seconds so the update check
 * never competes with the app actually loading, then checks on a
 * long cycle. Sessions that last days still find out.
 */
export function startUpdateChecks() {
  if (started || !isDesktopApp()) return;
  started = true;

  window.setTimeout(() => {
    void checkForUpdate();
    window.setInterval(() => void checkForUpdate(), EVERY);
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
