import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { useIsDeveloper } from "../lib/dev";
import { devModeStored, setDevMode } from "../lib/devMode";
import { DevTools } from "../components/DevPanel";

/**
 * The Developer page — /dev, from the sidebar.
 *
 * Everything that is yours and nobody else's, in one place: the
 * developer-mode switch, the tools (reports, news, numbers, ads,
 * flags, Pro, creators, seeded accounts, build) and the way to the
 * metrics charts. It replaced the Developer card on Settings on
 * 2026-10-03 (MARZ: "move developer to the sidebar instead of in
 * settings").
 *
 * Gated the same way as the metrics page: the database says whether
 * you're a developer, and until it has answered the page draws nothing
 * rather than flashing a "developers only" message at the owner.
 */
export default function Developer() {
  const { user } = useAuth();
  const isDev = useIsDeveloper(user?.id);
  const [checked, setChecked] = useState(false);
  const latest = useRef(0);

  // Give the developer check a moment before concluding "not you".
  useEffect(() => {
    const ask = ++latest.current;
    const t = setTimeout(() => {
      if (ask === latest.current) setChecked(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [user]);

  if (!isDev) {
    return checked ? (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <h1 className="display mb-2 text-2xl">Developers only</h1>
          <p className="text-sm text-muted">
            There's nothing for you here.{" "}
            <Link to="/home" className="text-accent underline underline-offset-2">
              Back home
            </Link>
          </p>
        </div>
      </div>
    ) : null;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display on-art text-2xl sm:text-3xl">Developer</h1>
          <p className="on-art mt-1 text-sm text-muted">
            Only you can see this page.
          </p>
        </div>
        <Link
          to="/dev/metrics"
          className="inline-flex items-center gap-2 notch-md border border-accent/50 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
          </svg>
          Metrics &amp; charts
        </Link>
      </header>

      <DevModeCard />

      <DevTools />
    </div>
  );
}

/**
 * Developer mode: the switch for the controls that act on other
 * people's things (lib/devMode.ts, supabase/89). Per machine; the
 * database checks who you are regardless.
 */
function DevModeCard() {
  const [on, setOn] = useState(devModeStored);

  return (
    <section className="mb-6 notch border border-accent/40 bg-surface bg-[linear-gradient(rgb(255_122_47/0.05),rgb(255_122_47/0.05))] p-5">
      <label className="flex cursor-pointer items-start gap-4">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => {
            const next = !on;
            setOn(next);
            setDevMode(next);
          }}
          className={
            "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition " +
            (on ? "bg-accent" : "bg-line")
          }
        >
          <span
            className={
              "absolute top-0.5 h-5 w-5 rounded-full bg-bg transition " +
              (on ? "left-[22px]" : "left-0.5")
            }
          />
        </button>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">
            Developer mode {on ? "— on" : "— off"}
          </span>
          <span className="mt-1 block text-sm leading-relaxed text-muted">
            On, the master controls appear everywhere: delete any post or
            comment, and warn, ban or edit any player from their profile. Every
            action is logged with your name. Off, Pentra behaves for you exactly
            as it does for everyone else — the Seeded tags on fake accounts
            stay either way.
          </span>
        </span>
      </label>
    </section>
  );
}
