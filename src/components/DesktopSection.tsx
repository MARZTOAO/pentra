import { useEffect, useState } from "react";
import {
  detectOS,
  getLatestRelease,
  isDesktopApp,
  osLabel,
  RELEASES_PAGE,
  type Release,
} from "../lib/platform";
import { checkForUpdate, installUpdate } from "../lib/updater";
import { useUpdateState } from "./UpdateBanner";

/**
 * The Settings card about the desktop app.
 *
 * Two different cards, really, depending on where it's drawn. In the
 * installed app it's "what version is this and is there a newer one".
 * In a browser it's "there is an installed app, here's the installer"
 * — because once you're signed in, the home page (which has the
 * download) is never shown again, and this is where you'd look.
 */
export function DesktopSection() {
  return isDesktopApp() ? <InApp /> : <InBrowser />;
}

/* ------------------------------------------------------------------ */

function InApp() {
  const s = useUpdateState();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    import("@tauri-apps/api/app")
      .then((m) => m.getVersion())
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  const busy = s.kind === "checking" || s.kind === "downloading" || s.kind === "installing";

  let line: string;
  switch (s.kind) {
    case "checking":
      line = "Checking…";
      break;
    case "current":
      line = "You're on the latest version.";
      break;
    case "available":
      line = `Pentra ${s.version} is available.`;
      break;
    case "downloading":
      line = s.percent === null ? "Downloading…" : `Downloading… ${s.percent}%`;
      break;
    case "installing":
      line = "Installing. The app will restart.";
      break;
    case "error":
      line = s.message;
      break;
    default:
      line = "Updates are checked when the app opens and every few hours.";
  }

  return (
    <section className="mb-8 notch border border-line bg-surface p-5">
      <h2 className="mb-1 label-wide text-muted">Desktop app</h2>
      <p className="mb-4 text-xs text-muted">
        Pentra{version && <span className="numeric"> {version}</span>}, installed. It
        keeps itself current with the website — the same push updates both.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {s.kind === "available" ? (
          <button
            onClick={() => void installUpdate()}
            className="notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi"
          >
            Install {s.version} and restart
          </button>
        ) : (
          <button
            onClick={() => void checkForUpdate()}
            disabled={busy}
            className="notch-md border border-line px-4 py-2 text-sm font-medium transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Check for updates
          </button>
        )}
        <p className={"text-xs " + (s.kind === "error" ? "text-danger" : "text-muted")}>
          {line}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function InBrowser() {
  const [release, setRelease] = useState<Release | null | undefined>(undefined);
  useEffect(() => {
    getLatestRelease().then(setRelease);
  }, []);

  const os = detectOS() === "mac" ? "mac" : "windows";
  const url = os === "mac" ? release?.mac : release?.windows;

  return (
    <section className="mb-8 notch border border-line bg-surface p-5">
      <h2 className="mb-1 label-wide text-muted">Desktop app</h2>
      <p className="mb-4 text-xs text-muted">
        The same Pentra, installed on your PC: its own window, its own
        taskbar icon, and it updates itself. Same account — sign in and
        everything's there.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {url ? (
          <a
            href={url}
            className="notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi"
          >
            Download for {osLabel(os)}
            {release?.version && (
              <span className="numeric ml-2 text-xs opacity-70">v{release.version}</span>
            )}
          </a>
        ) : (
          <span className="notch-md border border-line px-4 py-2 text-sm font-medium text-muted opacity-60">
            {release === undefined ? "Looking for the latest build…" : "No build published yet"}
          </span>
        )}
        <a
          href={RELEASES_PAGE}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted transition hover:text-ink"
        >
          All versions
        </a>
      </div>
    </section>
  );
}
