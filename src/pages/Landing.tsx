import { useEffect, useState, type ReactNode } from "react";
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
import { PLATFORMS } from "../lib/constants";
import { AdSlot } from "../components/AdSlot";
import { SiteHeader, SiteFooter } from "../components/Site";
import { PRICES, useProOnSale } from "../lib/billing";
import { ON_GOLD, PRO_GOLD } from "../components/ProCard";
import { FullScreenLoader } from "../components/ui";

/**
 * pentra.gg — the front door.
 *
 * What a visitor sees at the root, signed in or not. Only the desktop
 * app never sees it — it has already been downloaded and does not
 * need to be sold to itself.
 *
 * Redesigned 2026-10-01 (MARZ: "sleek, professional, and high end … a
 * true custom look", with the penguin, without the Cipher background).
 * The look is the app's own — Archivo Black, the notched corner,
 * Space Mono numbers, one orange — pushed further: a hairline grid,
 * light rather than colour, and small pieces of real Pentra UI in
 * place of stock imagery. The UI pieces use made-up sample data and
 * describe features that exist today; nothing here promises anything
 * the app doesn't do. Pentra Pro isn't mentioned until it's on sale
 * (the Pricing section asks the database, so launch day needs no
 * deploy of the site).
 */
export default function Landing() {
  const { session, loading } = useAuth();
  const proOnSale = useProOnSale();

  // The desktop app never shows the page that sells the desktop app.
  // Signed-in people in a browser DO see it — it is where the
  // download lives, and hiding it from the people most likely to
  // install was backwards.
  if (isDesktopApp()) return <Navigate to="/home" replace />;
  if (loading) return <FullScreenLoader />;

  const signedIn = Boolean(session);

  return (
    <div className="min-h-full overflow-x-clip bg-bg text-ink">
      <SiteHeader sections pricing={proOnSale} />
      <Hero signedIn={signedIn} />
      <PlatformStrip />
      <HowItWorks />
      <AdSlot slot={import.meta.env.VITE_ADSENSE_SLOT_HOME_MID} className="my-16" />
      <Features />
      <OgCallout signedIn={signedIn} />
      {proOnSale && <Pricing signedIn={signedIn} />}
      <Download />
      <FinalCta signedIn={signedIn} />
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
/*  Hero                                                               */
/* ------------------------------------------------------------------ */

function Hero({ signedIn }: { signedIn: boolean }) {
  const os = downloadOS();

  return (
    <section className="relative isolate">
      {/* Light, not colour: a hairline grid that fades out, and a warm
          glow where the mascot stands. */}
      <div className="lp-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -z-10 h-[46rem] w-[46rem] rounded-full opacity-60 blur-3xl max-lg:left-1/2 max-lg:top-[38rem] max-lg:-translate-x-1/2 lg:right-[-10rem] lg:top-[-6rem]"
        style={{ background: "radial-gradient(circle, rgb(255 122 47 / 0.22), transparent 62%)" }}
        aria-hidden="true"
      />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.2fr_1fr] lg:gap-10 lg:pb-28 lg:pt-24">
        <div className="rise">
          <span className="inline-flex items-center gap-2 notch-sm border border-line bg-surface/70 px-3 py-1.5 text-xs text-muted backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
            </span>
            Free on Windows and in your browser
          </span>

          {/* Sized so each line fits its column on one line at every
              width from sm up (measured: the first line is 8.7× the
              font size). */}
          <h1 className="display mt-7 text-[2.6rem] leading-[0.95] sm:text-6xl lg:text-[3.5rem] xl:text-[4rem]">
            Find your squad.
            <br />
            Play <span className="text-accent">tonight.</span>
          </h1>

          <p className="mt-7 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Pentra matches you with players who love the same games, play
            on the same system and are free at the same hours. Post a
            session, fill the slots, and stop scrolling for a squad.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <DownloadButton os={os} primary />
            <Link
              to={signedIn ? "/home" : "/signup"}
              className="notch-md inline-flex items-center justify-center gap-2 border border-line bg-surface/60 px-5 py-3 text-sm font-semibold backdrop-blur transition hover:border-muted hover:bg-surface"
            >
              {signedIn ? "Open in your browser" : "Play in your browser"}
              <Arrow />
            </Link>
          </div>

          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
            {["Free to play", "One account on desktop and web", "Matched by games, platform and hours"].map(
              (t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check />
                  {t}
                </li>
              ),
            )}
          </ul>
        </div>

        <Stage />
      </div>
    </section>
  );
}

/**
 * The mascot on a lit stage: two slowly turning pentagons from the
 * Pentra mark behind him, a pool of light under his feet, and three
 * pieces of the real app floating beside him.
 */
function Stage() {
  return (
    <div className="relative mx-auto w-full max-w-[30rem]">
      <div className="relative aspect-[4/5]">
        {/* The rings: the mark's pentagon, outlined, turning very slowly
            in opposite directions. Still for reduced motion (index.css). */}
        <div className="absolute left-1/2 top-[44%] w-[108%] -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
        <svg viewBox="-50 -50 100 100" className="block w-full animate-[spin_140s_linear_infinite]">
          <polygon points={pentagon(46)} fill="none" stroke="rgb(255 122 47 / 0.28)" strokeWidth="0.25" />
          {pentagonPoints(46).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === 0 ? 1.6 : 1.2} fill="rgb(255 122 47 / 0.55)" />
          ))}
        </svg>
        </div>
        <div className="absolute left-1/2 top-[44%] w-[84%] -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
        <svg viewBox="-50 -50 100 100" className="block w-full animate-[spin_100s_linear_infinite_reverse]">
          <polygon
            points={pentagon(46)}
            fill="rgb(255 122 47 / 0.035)"
            stroke="rgb(255 255 255 / 0.12)"
            strokeWidth="0.3"
            strokeDasharray="1.2 2.4"
          />
        </svg>
        </div>

        {/* Pool of light on the floor. */}
        <div
          className="absolute bottom-[6%] left-1/2 h-[9%] w-[64%] -translate-x-1/2 rounded-[50%] blur-xl"
          style={{ background: "radial-gradient(closest-side, rgb(255 122 47 / 0.45), rgb(0 0 0 / 0.6) 70%, transparent)" }}
          aria-hidden="true"
        />

        {/* Centred by the wrapper, bobbing on the image — kept on
            separate elements so the two movements don't fight. */}
        <div className="absolute bottom-[8%] left-1/2 h-[86%] -translate-x-1/2">
          <img
            src="/mascot/penguin.webp"
            alt="Pentra's penguin mascot, wearing a gaming headset"
            width={900}
            height={1257}
            fetchPriority="high"
            className="lp-float h-full w-auto max-w-none drop-shadow-[0_24px_40px_rgb(0_0_0/0.6)]"
          />
        </div>

        {/* Pieces of the app, with sample data. Hidden on the smallest
            screens, where they'd sit on top of him. */}
        <FloatCard className="left-0 top-[6%] hidden sm:block" delay="0.2s">
          <div className="flex items-center gap-3">
            <Ring value={92} />
            <div>
              <p className="text-sm font-semibold">NightOwl</p>
              <p className="text-[11px] text-muted">3 games in common · PC</p>
            </div>
          </div>
        </FloatCard>

        <FloatCard className="right-0 top-[58%] hidden w-56 sm:block xl:-right-12" delay="0.45s">
          <p className="label-wide text-[9px] text-accent">Session · Tonight 9:00 PM</p>
          <p className="mt-1 text-sm font-semibold">Ranked, need 2 more</p>
          <div className="mt-2.5 flex items-center justify-between">
            <Slots filled={3} total={5} />
            <span className="notch-sm bg-accent px-2.5 py-1 text-[11px] font-bold text-onaccent">Join</span>
          </div>
        </FloatCard>

        <FloatCard className="left-0 top-[74%] hidden sm:block" delay="0.7s">
          <div className="flex items-center gap-2.5">
            <span className="notch-sm flex h-8 w-8 items-center justify-center bg-accent-dim text-accent">
              <Trophy />
            </span>
            <div>
              <p className="label-wide text-[9px] text-muted">Achievement</p>
              <p className="text-sm font-semibold">Showed Up</p>
            </div>
          </div>
        </FloatCard>
      </div>
    </div>
  );
}

function FloatCard({
  className,
  delay,
  children,
}: {
  className: string;
  delay: string;
  children: ReactNode;
}) {
  return (
    <div className={"rise absolute z-10 " + className} style={{ animationDelay: delay }} aria-hidden="true">
      <div className="float-shadow">
        <div className="notch-md border border-line/80 bg-surface/80 p-3.5 backdrop-blur-md">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PlatformStrip() {
  return (
    <section className="border-y border-line bg-surface/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-6 sm:px-8 lg:flex-row lg:items-center lg:gap-10">
        <p className="label-wide shrink-0 text-muted">Find players on</p>
        <ul className="numeric flex flex-wrap gap-x-7 gap-y-2 text-xs uppercase tracking-widest text-ink/70">
          {PLATFORMS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  How it works                                                       */
/* ------------------------------------------------------------------ */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Pick your Top 5",
      body: "The five games you actually play. It's the first thing people see on your profile, and it's what matching runs on.",
    },
    {
      n: "02",
      title: "See who lines up",
      body: "Every player shows a match percentage — shared games, platform, hours and region. Find players lists the best matches first.",
    },
    {
      n: "03",
      title: "Post a session",
      body: "Game, time, slots, platform, mics or not. People join, a group chat opens, and everyone gets a reminder before it starts.",
    },
  ];

  return (
    <section id="how" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <SectionHead kicker="How it works" title="From sign-up to playing in three steps." />
        <ol className="mt-14 grid gap-px overflow-hidden notch border border-line bg-line sm:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="relative bg-bg p-7 sm:p-8">
              <span className="lp-outline display text-6xl">{s.n}</span>
              <h3 className="display mt-6 text-xl">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Features — a bento of real pieces of the app                       */
/* ------------------------------------------------------------------ */

function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-t border-line bg-surface/30">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <SectionHead kicker="What's in it" title="Everything a squad needs. Nothing it doesn't." />

        <div className="mt-14 grid gap-4 md:grid-cols-6">
          <Tile
            className="md:col-span-4"
            title="A match percentage on every player"
            body="Worked out live from both your Top 5s, your game libraries, platforms, hours and region — so the number means something."
          >
            <div className="space-y-2.5">
              {[
                ["NightOwl", 92, "3 Top 5 games · PC · evenings"],
                ["pixel_pete", 78, "2 Top 5 games · PC"],
                ["Zara", 64, "Same hours · North America"],
              ].map(([name, pct, why]) => (
                <div key={name as string} className="flex items-center gap-3 notch-sm border border-line bg-bg/60 px-3 py-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-muted">
                    {(name as string).charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{name}</span>
                    <span className="block truncate text-[11px] text-muted">{why}</span>
                  </span>
                  <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-surface-2 sm:block">
                    <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="numeric w-10 text-right text-sm font-bold text-accent">{pct}%</span>
                </div>
              ))}
            </div>
          </Tile>

          <Tile
            className="md:col-span-2"
            title="Sessions that fill"
            body="Set the time and the slots. Invite friends straight in — their seat is held until they answer."
          >
            <div className="notch-sm border border-accent/40 bg-accent/5 p-3">
              <p className="numeric text-[11px] text-accent">TODAY · 21:00</p>
              <p className="mt-1 text-sm font-semibold">Co-op night, mics on</p>
              <div className="mt-3 flex items-center justify-between">
                <Slots filled={4} total={5} />
                <span className="numeric text-[11px] text-muted">4 / 5</span>
              </div>
            </div>
          </Tile>

          <Tile
            className="md:col-span-2"
            title="Group chat, built in"
            body="Every session gets its own chat for everyone who joined. Direct messages for everything else."
          >
            <div className="space-y-1.5 text-xs">
              <p className="w-fit max-w-[85%] notch-sm border border-line bg-bg/60 px-2.5 py-1.5">on in 5, setting up</p>
              <p className="ml-auto w-fit max-w-[85%] notch-sm bg-accent px-2.5 py-1.5 text-onaccent">same, inviting now</p>
              <p className="w-fit max-w-[85%] notch-sm border border-line bg-bg/60 px-2.5 py-1.5">gg last night 🔥</p>
            </div>
          </Tile>

          <Tile
            className="md:col-span-2"
            title="Find players"
            body="Filter by game, platform and region. The best matches always come first."
          >
            <div className="flex flex-wrap gap-1.5">
              {["Any of my games", "PC", "North America"].map((f, i) => (
                <span
                  key={f}
                  className={
                    "notch-sm px-2.5 py-1 text-[11px] " +
                    (i === 0 ? "bg-surface-2 text-muted" : "bg-accent/15 font-semibold text-accent")
                  }
                >
                  {f}
                </span>
              ))}
            </div>
          </Tile>

          <Tile
            className="md:col-span-2"
            title="Good teammates stand out"
            body="Played well together? Give a commendation. It shows on their profile and builds their player rating."
          >
            <div className="flex items-center gap-3">
              <span className="notch-sm flex h-10 w-10 items-center justify-center bg-ok/15 text-ok">
                <Thumb />
              </span>
              <span>
                <span className="numeric block text-lg font-bold">+1 commendation</span>
                <span className="block text-[11px] text-muted">from your last session</span>
              </span>
            </div>
          </Tile>

          <Tile
            className="md:col-span-3"
            title="Achievements"
            body="Badges for the things that make a good squad — from your first post to playing every week for a year."
          >
            <div className="flex gap-2">
              {["Hello World", "Showed Up", "Host", "Regular", "Unbroken"].map((b, i) => (
                <span
                  key={b}
                  title={b}
                  className={
                    "notch-sm flex h-11 w-11 items-center justify-center " +
                    (i < 3 ? "bg-accent-dim text-accent" : "bg-surface-2 text-muted/50")
                  }
                >
                  <Trophy />
                </span>
              ))}
            </div>
          </Tile>

          <Tile
            className="md:col-span-3"
            title="A desktop app that stays out of the way"
            body="Sits in your tray, tells you when someone joins or messages, and updates itself. Optional start with Windows."
          >
            <div className="notch-sm flex items-center gap-3 border border-line bg-bg/70 p-3">
              <span className="notch-sm flex h-8 w-8 shrink-0 items-center justify-center bg-accent text-onaccent">
                <MarkIcon />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold">Pentra</span>
                <span className="block truncate text-[11px] text-muted">NightOwl joined your session</span>
              </span>
              <span className="numeric ml-auto text-[10px] text-muted">now</span>
            </div>
          </Tile>
        </div>
      </div>
    </section>
  );
}

function Tile({
  title,
  body,
  className = "",
  children,
}: {
  title: string;
  body: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={"group relative notch border border-line bg-surface p-6 transition hover:border-accent/40 sm:p-7 " + className}>
      {/* A hairline of orange along the top on hover. */}
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent opacity-0 transition group-hover:opacity-100" />
      <div className="mb-6">{children}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pentra OG                                                          */
/* ------------------------------------------------------------------ */

function OgCallout({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative isolate overflow-hidden border-t border-line">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(60% 120% at 50% 0%, rgb(255 122 47 / 0.14), transparent 70%)" }}
        aria-hidden="true"
      />
      <div className="mx-auto flex max-w-4xl flex-col items-center px-5 py-20 text-center sm:px-8 sm:py-24">
        <span className="notch-sm inline-flex items-center gap-2 bg-accent px-3 py-1 font-display text-sm uppercase tracking-[0.06em] text-onaccent">
          <MarkIcon />
          Pentra OG
          <span className="numeric font-bold normal-case tracking-normal opacity-75">#0042 of 1,000</span>
        </span>
        <h2 className="display mt-8 text-3xl sm:text-5xl">Be one of the first thousand.</h2>
        <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
          The first 1,000 players get a numbered Pentra OG badge on their
          profile — numbered in the order accounts are confirmed, and
          theirs for good.
        </p>
        {!signedIn && (
          <Link
            to="/signup"
            className="notch-md mt-9 inline-flex items-center gap-2 bg-accent px-6 py-3 text-sm font-semibold text-onaccent transition hover:bg-accent-hi"
          >
            Claim your number
            <Arrow />
          </Link>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Pricing — only once Pro is on sale                                 */
/* ------------------------------------------------------------------ */

const FREE_HAS = [
  "Find players by game, platform and hours",
  "Host a session, join up to three",
  "Friends, messages and the feed",
  "The desktop app",
];

const PRO_HAS = [
  "Everything in Free",
  "The gold PRO badge",
  "30 avatar frames",
  "Moving profile backgrounds",
  "50 Pro avatars and 40 backgrounds",
  "Gold posts and sessions",
  "Host and join unlimited sessions",
];

function Pricing({ signedIn }: { signedIn: boolean }) {
  const y = PRICES.yearly;
  const m = PRICES.monthly;
  return (
    <section id="pricing" className="scroll-mt-20 border-t border-line bg-surface/30">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <SectionHead kicker="Pricing" title="Free to play. Pro if you want the gold." />

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {/* Free */}
          <div className="notch border border-line bg-surface p-7 sm:p-9">
            <p className="label-wide text-muted">Free</p>
            <p className="mt-4">
              <span className="display text-4xl">$0</span>
            </p>
            <p className="mt-1 text-sm text-muted">Everything it takes to find your next squad.</p>
            <ul className="mt-7 space-y-2.5 text-sm">
              {FREE_HAS.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <span className="mt-1 text-accent"><Check /></span>
                  {f}
                </li>
              ))}
            </ul>
            {!signedIn && (
              <Link
                to="/signup"
                className="notch-md mt-9 inline-flex items-center gap-2 border border-line px-5 py-3 text-sm font-semibold transition hover:border-muted"
              >
                Create your free account
                <Arrow />
              </Link>
            )}
          </div>

          {/* Pro */}
          <div className="relative notch p-px" style={{ background: PRO_GOLD }}>
            <div className="notch h-full bg-surface p-7 sm:p-9">
              <div className="flex items-center justify-between gap-3">
                <p className="label-wide" style={{ color: "#f7b733" }}>Pentra Pro</p>
                <span
                  className="notch-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: PRO_GOLD, color: ON_GOLD }}
                >
                  Save 17% yearly
                </span>
              </div>
              <p className="mt-4">
                <span className="display text-4xl">${y.perMonth.toFixed(2)}</span>
                <span className="text-sm text-muted"> / month</span>
              </p>
              <p className="mt-1 text-sm text-muted">
                Billed ${y.billed.toFixed(2)} a year, or ${m.billed.toFixed(2)} month to month.
              </p>
              <ul className="mt-7 space-y-2.5 text-sm">
                {PRO_HAS.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span className="mt-1" style={{ color: "#f7b733" }}><Check /></span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to={signedIn ? "/pro" : "/signup"}
                className="notch-md mt-9 inline-flex items-center gap-2 px-5 py-3 text-sm font-bold transition hover:brightness-105"
                style={{ background: PRO_GOLD, color: ON_GOLD }}
              >
                {signedIn ? "Get Pentra Pro" : "Start free, upgrade any time"}
                <Arrow />
              </Link>
              <p className="mt-5 text-xs leading-relaxed text-muted">
                Cancel any time. Full refund within 14 days of your first
                payment. Promo codes are entered at checkout.
              </p>
            </div>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0 right-4 top-0 h-[3px]"
              style={{ background: PRO_GOLD }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Download                                                           */
/* ------------------------------------------------------------------ */

function Download() {
  const os = downloadOS();
  const other: OS = os === "mac" ? "windows" : "mac";

  return (
    <section id="download" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="relative overflow-hidden notch border border-line bg-surface p-8 sm:p-12">
          <div className="lp-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="label-wide mb-4 text-accent">Desktop app</p>
              <h2 className="display text-3xl sm:text-5xl">Pentra, on your PC.</h2>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-muted sm:text-base">
                The full app, installed. Updates itself, lives in your tray,
                and signs in with the same account you use in the browser —
                nothing to set up twice.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <DownloadButton os={os} primary />
              <DownloadButton os={other} />
              <p className="text-xs text-muted">
                Every version is on{" "}
                <a href={RELEASES_PAGE} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  GitHub
                </a>
                .
              </p>
            </div>
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
    ? "notch-md bg-accent text-onaccent shadow-[0_0_0_1px_rgb(255_122_47/0.4),0_10px_30px_-10px_rgb(255_122_47/0.6)] hover:bg-accent-hi"
    : "notch-md border border-line bg-bg/40 text-ink hover:border-muted hover:bg-surface";

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

/* ------------------------------------------------------------------ */

function FinalCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-5 py-20 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
        <h2 className="display max-w-2xl text-3xl sm:text-5xl">
          Your next squad is
          <br />
          <span className="text-accent">already here.</span>
        </h2>
        <Link
          to={signedIn ? "/home" : "/signup"}
          className="notch-md inline-flex shrink-0 items-center gap-2 bg-accent px-6 py-3.5 text-sm font-semibold text-onaccent transition hover:bg-accent-hi"
        >
          {signedIn ? "Open Pentra" : "Create your free account"}
          <Arrow />
        </Link>
      </div>
    </section>
  );
}

function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <p className="label-wide mb-4 text-accent">{kicker}</p>
      <h2 className="display text-3xl leading-[1.05] sm:text-[2.75rem]">{title}</h2>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small drawn pieces                                                 */
/* ------------------------------------------------------------------ */

/** Corner points of a regular pentagon, point up, centred on 0,0. */
function pentagonPoints(r: number): [number, number][] {
  return Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [+(r * Math.cos(a)).toFixed(2), +(r * Math.sin(a)).toFixed(2)];
  });
}

function pentagon(r: number): string {
  return pentagonPoints(r).map((p) => p.join(",")).join(" ");
}

/** A small match ring, like the one on profiles. */
function Ring({ value }: { value: number }) {
  const c = 2 * Math.PI * 16;
  return (
    <span className="relative flex h-11 w-11 items-center justify-center">
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r="16" fill="none" stroke="#2e3239" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r="16"
          fill="none"
          stroke="#ff7a2f"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(c * value) / 100} ${c}`}
        />
      </svg>
      <span className="numeric text-[11px] font-bold">{value}%</span>
    </span>
  );
}

function Slots({ filled, total }: { filled: number; total: number }) {
  return (
    <span className="flex gap-1" aria-label={`${filled} of ${total} slots filled`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={"h-2 w-5 notch-sm " + (i < filled ? "bg-accent" : "bg-surface-2")} />
      ))}
    </span>
  );
}

function Arrow() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Check() {
  return (
    <svg className="h-3.5 w-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

function Trophy() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
    </svg>
  );
}

function Thumb() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 10v11H4V10h3ZM7 10l4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 17.7 21H7" />
    </svg>
  );
}

/** The Pentra mark, filled with the text colour (brand/pentra-mark.svg). */
function MarkIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="14.67 7.7 993.65 978.71" fill="currentColor" aria-hidden="true">
      <path d="M511.5 81.26L956.35 404.46L786.43 927.41L236.57 927.41L66.65 404.46ZM160.7 435.02L294.69 847.41L728.31 847.41L862.3 435.02L511.5 180.14ZM388.5 130.7A123 123 0 0 1 634.5 130.7A123 123 0 0 1 388.5 130.7ZM810.33 419.74A99 99 0 0 1 1008.33 419.74A99 99 0 0 1 810.33 419.74ZM658.37 887.41A99 99 0 0 1 856.37 887.41A99 99 0 0 1 658.37 887.41ZM166.63 887.41A99 99 0 0 1 364.63 887.41A99 99 0 0 1 166.63 887.41ZM14.67 419.74A99 99 0 0 1 212.67 419.74A99 99 0 0 1 14.67 419.74Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}
