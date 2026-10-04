/**
 * Where is this running, and what can it download?
 *
 * Three questions the public home page needs answered, kept together
 * because they're all "what is the thing in front of me" questions.
 */

/**
 * Inside the desktop app?
 *
 * Tauri 2 puts this global on the window of every webview it hosts.
 * The desktop app must never show the marketing page — somebody who
 * has already installed Pentra doesn't need to be sold it — so this is
 * checked before the home route decides what to render.
 */
export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Opens a web address in the person's own browser.
 *
 * In a browser that's a new tab. In the desktop app a plain link or
 * window.open would try to open inside Pentra's own window, so it goes
 * through Tauri's opener plugin instead (allowed for http/https by
 * "opener:default" in src-tauri/capabilities/default.json).
 *
 * Only http(s) — anything else is ignored rather than opened.
 */
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;

  if (isDesktopApp()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch {
      // Fall through to the browser way rather than doing nothing.
    }
  }

  // Called before any await on this path, so the browser still counts
  // it as part of the click and doesn't block it as a pop-up.
  window.open(url, "_blank", "noopener,noreferrer");
}

export type OS = "windows" | "mac" | "linux" | "other";

/**
 * Best guess from the user agent. Used only to decide which download
 * button to make big — the other OS is always one click away, so
 * being wrong costs a click rather than a dead end.
 */
export function detectOS(): OS {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "other";
}

/**
 * A phone or tablet, where there is no desktop app to offer. iPadOS
 * Safari calls itself a Mac, so the touch-point count is the tell.
 */
export function isHandheld(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

export function osLabel(os: OS): string {
  switch (os) {
    case "windows":
      return "Windows";
    case "mac":
      return "Mac";
    case "linux":
      return "Linux";
    default:
      return "desktop";
  }
}

/* ------------------------------------------------------------------
 *  Releases.
 *
 *  Installers live on GitHub Releases. The home page asks GitHub for
 *  the latest one and links straight to the right asset, so a new
 *  release is live on the website the moment it's published, with no
 *  deploy of the site itself.
 *
 *  If there's no release yet — or the repository is private, which
 *  makes the API answer 404 to the public — the page says "coming
 *  soon" and leads with the browser instead. A download button that
 *  404s is worse than none.
 * ---------------------------------------------------------------- */

const REPO = "MARZTOAO/pentra";

export type Release = {
  version: string;
  publishedAt: string;
  windows: string | null;
  mac: string | null;
};

type GitHubAsset = { name: string; browser_download_url: string };
type GitHubRelease = {
  tag_name: string;
  published_at: string;
  assets: GitHubAsset[];
};

let cached: Promise<Release | null> | null = null;

export function getLatestRelease(): Promise<Release | null> {
  if (cached) return cached;

  cached = fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const r = (await res.json()) as GitHubRelease;

      // Tauri names its bundles predictably. The NSIS .exe is the
      // friendlier Windows installer; the .msi is the fallback.
      const win =
        r.assets.find((a) => /-setup\.exe$/i.test(a.name)) ??
        r.assets.find((a) => /\.msi$/i.test(a.name)) ??
        null;
      const mac =
        r.assets.find((a) => /\.dmg$/i.test(a.name)) ??
        r.assets.find((a) => /\.app\.tar\.gz$/i.test(a.name)) ??
        null;

      return {
        version: r.tag_name.replace(/^v/, ""),
        publishedAt: r.published_at,
        windows: win?.browser_download_url ?? null,
        mac: mac?.browser_download_url ?? null,
      };
    })
    .catch(() => null);

  return cached;
}

/** The page every installer lives on, for people who want to see the list. */
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

/* ------------------------------------------------------------------
 *  Where Pentra lives on the web.
 *
 *  Needed because `window.location.origin` is NOT a shareable address
 *  everywhere the app runs. Inside the desktop app it is
 *  `http://tauri.localhost`; on a Vercel preview it is a frozen
 *  deployment URL that will never update. An invite link built from
 *  either is a link that does nothing when a friend clicks it.
 *
 *  So anything meant to leave the app and be opened by somebody else
 *  is built from this, never from the current location.
 *
 *  ONE PLACE TO CHANGE when the domain changes.
 * ---------------------------------------------------------------- */
export const SITE_URL = "https://pentra.gg";
