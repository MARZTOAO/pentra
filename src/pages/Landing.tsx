import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import {
  detectOS,
  getLatestRelease,
  isDesktopApp,
  osLabel,
  RELEASES_PAGE,
  type OS,
  type Release,
} from "../lib/platform";
import { AdSlot } from "../components/AdSlot";
import { SiteHeader, SiteFooter } from "../components/Site";
import { FullScreenLoader } from "../components/ui";

/**
 * The front door.
 *
 * What a visitor sees at the root, signed in or not. Only the desktop
 * app never sees it — it has already been downloaded and does not
 * need to be sold to itself.
 *
 * Deliberately restrained. One accent, a lot of space, and type doing
 * the work. Most of what makes this feel professional is what isn't
 * on it.
 */
export default function Landing() {
  const { session, loading } = useAuth();

  // The desktop app never shows the page that sells the desktop app.
  // Signed-in people in a browser DO see it — it is where the
  // download lives, and hiding it from the people most likely to
  // install was backwards.
  if (isDesktopApp()) return <Navigate to="/home" replace />;
  if (loading) return <FullScreenLoader />;

  return (
    <div className="min-h-full bg-bg text-ink">
      <SiteHeader />
      <Hero signedIn={Boolean(session)} />
      <HowItWorks />
      <AdSlot slot={import.meta.env.VITE_ADSENSE_SLOT_HOME_MID} className="my-16" />
      <Features />
      <Download />
      <SiteFooter />
    </div>
  );
}

/**
 * Which installer to lead with. There are Windows and Mac builds, so a
 * Linux or unknown visitor gets Windows offered first rather than a
 * button for a platform that doesn't exist.
 */
function downloadOS(): OS {
  return detectOS() === "mac" ? "mac" : "windows";
}

/* ------------------------------------------------------------------ */

function Hero({ signedIn }: { signedIn: boolean }) {
  const os = downloadOS();

  return (
    <section className="mx-auto max-w-6xl px-5 pb-20 pt-12 sm:px-8 sm:pt-20 lg:pt-28">
      <div className="grid items-center gap-12 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
        <div>
          <p className="label-wide mb-5 text-accent">For people who play with people</p>

          <h1 className="display text-[2rem] sm:text-5xl lg:text-[3.5rem]">
            Find your group.
            <br />
            Play tonight.
          </h1>

          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
            Pentra matches you with players who are into the same games,
            on the same system, at the same hours. Post a session, fill
            the slots, and stop scrolling for a squad.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <DownloadButton os={os} primary />
            <Link
              to={signedIn ? "/home" : "/signup"}
              className="notch-md border border-line px-5 py-3 text-center text-sm font-semibold transition hover:border-muted hover:bg-surface"
            >
              {signedIn ? "Open in your browser" : "Play in your browser"}
            </Link>
          </div>

          <p className="mt-4 text-xs text-muted">
            Free. Same account, same friends, same sessions on desktop
            and in the browser.
          </p>
        </div>

        <Mark />
      </div>
    </section>
  );
}

/**
 * The five nodes, drawn large. It's the app icon, and it's the one
 * piece of imagery on the page — everything else is type. When there
 * are real screenshots this is where the first one goes.
 */
function Mark() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="float-shadow">
        <div className="notch relative aspect-square overflow-hidden border border-line bg-surface">
          <div
            className="absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(60% 60% at 30% 25%, rgb(255 122 47 / 0.22), transparent 70%), radial-gradient(50% 50% at 75% 80%, rgb(255 122 47 / 0.12), transparent 70%)",
            }}
          />
          <img
            src="/icon-512.png"
            alt=""
            width={512}
            height={512}
            className="relative h-full w-full object-contain p-[14%]"
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Pick your Top 5",
      body: "The five games you actually play. It's the first thing anyone sees, and it's what matching runs on.",
    },
    {
      n: "02",
      title: "See who lines up",
      body: "Every profile shows a match percentage — same games, same platform, same hours. It moves as your games do.",
    },
    {
      n: "03",
      title: "Post a session",
      body: "Time, slots, system, mics or not. People join, the group chat opens, and you're playing.",
    },
  ];

  return (
    <section className="border-y border-line bg-surface/60">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <p className="label-wide mb-10 text-muted">How it works</p>
        <ol className="grid gap-10 sm:grid-cols-3 sm:gap-8">
          {steps.map((s) => (
            <li key={s.n}>
              <span className="numeric text-sm text-accent">{s.n}</span>
              <h3 className="display mt-3 text-xl sm:text-2xl">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Features() {
  const items = [
    ["Match percentage", "On every profile. Worked out live from both your Top 5s, libraries, platforms and hours."],
    ["Sessions", "Post what you're playing and when. Slots fill, the group chat opens, reminders go out."],
    ["Friends who play", "Invite friends into a session from the card. Slots are held until they answer."],
    ["Achievements", "More than forty badges, from your first post to playing a session every week for a year."],
    ["Direct messages", "Chat with friends and with the people in your session. Group chats spin up on their own."],
    ["A smarter game search", "Type it how you say it. gta, helldivers2, assassins creed — it finds the game."],
  ];

  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
      <p className="label-wide mb-10 text-muted">What's in it</p>
      <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([title, body]) => (
          <div key={title}>
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Download() {
  const os = downloadOS();
  const other: OS = os === "mac" ? "windows" : "mac";

  return (
    <section id="download" className="border-t border-line bg-surface/60">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="label-wide mb-4 text-accent">Desktop app</p>
            <h2 className="display text-3xl sm:text-4xl">
              Pentra, on your PC.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted sm:text-base">
              The full app, installed. Updates itself. Signs in with the
              same account you use in the browser — nothing to set up
              twice.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <DownloadButton os={os} primary />
            <DownloadButton os={other} />
            <p className="text-xs text-muted">
              All versions on{" "}
              <a
                href={RELEASES_PAGE}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                GitHub
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * One button per operating system. Reads the latest GitHub release
 * once (shared across every instance on the page) and links straight
 * to the installer. Until there's a release — or for an OS that
 * doesn't have a build yet — it says so instead of leading to a 404.
 */
function DownloadButton({ os, primary = false }: { os: OS; primary?: boolean }) {
  const [release, setRelease] = useState<Release | null | undefined>(undefined);

  useEffect(() => {
    getLatestRelease().then(setRelease);
  }, []);

  const url =
    os === "windows" ? release?.windows : os === "mac" ? release?.mac : null;
  const checking = release === undefined;
  const ready = Boolean(url);

  const base = primary
    ? "notch-md bg-accent text-onaccent hover:bg-accent-hi"
    : "notch-md border border-line text-ink hover:border-muted hover:bg-surface";

  if (ready && url) {
    return (
      <a
        href={url}
        className={`${base} inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition`}
      >
        <DownloadIcon />
        Download for {osLabel(os)}
        {release?.version && (
          <span className="numeric text-xs opacity-70">v{release.version}</span>
        )}
      </a>
    );
  }

  return (
    <span
      aria-disabled="true"
      className={`${base} inline-flex cursor-default items-center justify-center gap-2 px-5 py-3 text-sm font-semibold opacity-60`}
    >
      <DownloadIcon />
      {checking ? `Download for ${osLabel(os)}` : `${osLabel(os)} — coming soon`}
    </span>
  );
}

function DownloadIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

