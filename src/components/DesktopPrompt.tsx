import { useEffect, useState } from "react";
import {
  detectOS,
  getLatestRelease,
  isDesktopApp,
  osLabel,
  type Release,
} from "../lib/platform";

/**
 * "Pentra is better as an app."
 *
 * A slim bar above the app, shown to people using it in a browser on
 * a machine we have a build for. This is the thing that actually
 * moves people onto the desktop app — the home page only reaches
 * people who aren't signed in yet, and by definition everyone already
 * using Pentra in a browser has walked past it.
 *
 * FOUR RULES, all of them about not being a nuisance:
 *
 *   1. Never in the desktop app. Obvious, and easy to get wrong.
 *   2. Never without a real download. If no release exists for this
 *      operating system — no Mac build yet, or somebody on Linux or a
 *      phone — the bar doesn't appear, because a prompt that leads
 *      nowhere is worse than no prompt.
 *   3. Not on the first visit. It waits until somebody has been back
 *      a few times, so the first thing a new player meets is the app,
 *      not an ad for a different version of it.
 *   4. Dismissable, and it stays dismissed for a month. "No" has to
 *      mean something or people stop reading.
 *
 * The count and the dismissal live in this browser only. That's the
 * right scope: installing is a per-machine act, so somebody who
 * installed on their desktop should still be told about it on their
 * laptop.
 */

const SEEN_KEY = "pentra.visits";
const HIDE_KEY = "pentra.desktopPromptHiddenUntil";
const SHOW_AFTER_VISITS = 3;
const HIDE_FOR_DAYS = 30;

/** Every storage call is wrapped: private windows throw rather than no-op. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Nothing to do. Worst case the bar reappears next time. */
  }
}

/**
 * Counts this visit and says whether the bar has earned its place.
 * Called once per mount, which is once per app load.
 */
function countVisitAndCheck(): boolean {
  const visits = Number(read(SEEN_KEY) ?? "0") + 1;
  write(SEEN_KEY, String(visits));

  const until = Number(read(HIDE_KEY) ?? "0");
  if (until && Date.now() < until) return false;

  return visits >= SHOW_AFTER_VISITS;
}

export function DesktopPrompt() {
  const [release, setRelease] = useState<Release | null>(null);
  const [allowed, setAllowed] = useState(false);
  const os = detectOS();

  useEffect(() => {
    if (isDesktopApp()) return;
    if (os !== "windows" && os !== "mac") return;

    setAllowed(countVisitAndCheck());
    getLatestRelease().then(setRelease);
  }, [os]);

  if (!allowed) return null;

  const url = os === "mac" ? release?.mac : release?.windows;
  if (!url) return null;

  function hide() {
    write(HIDE_KEY, String(Date.now() + HIDE_FOR_DAYS * 86400000));
    setAllowed(false);
  }

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-accent/30 bg-accent-dim px-3 py-2 text-sm sm:px-4">
      <p className="min-w-0 flex-1 truncate">
        <span className="font-semibold">Pentra runs better installed.</span>{" "}
        {/* The second sentence is the first thing to go when the
            window is narrow — the headline and the button are what
            the bar is for. */}
        <span className="hidden text-muted sm:inline">
          Same account, its own window, and it stays open while you play.
        </span>
      </p>

      <a
        href={url}
        onClick={hide}
        className="notch-sm shrink-0 bg-accent px-3 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi"
      >
        <span className="sm:hidden">Get the app</span>
        <span className="hidden sm:inline">Get it for {osLabel(os)}</span>
      </a>

      <button
        onClick={hide}
        aria-label="Not now"
        className="shrink-0 px-1 text-muted transition hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
