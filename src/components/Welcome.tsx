import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { needsWelcome, markWelcomed } from "../lib/profile";

/**
 * Shown once, the first time someone opens the app after signing up.
 *
 * A new account is the one state where Pentra can't do its job: Find
 * ranks people by the games, platforms and hours you have in common,
 * and a fresh profile has none of those, so the screen that's supposed
 * to sell the app is the emptiest one in it. This exists to get them
 * past that in the first minute, while they still care enough to type.
 *
 * The order of the steps isn't arbitrary — it follows what the matching
 * in supabase/26_match_reason.sql actually weighs. A Top 5 game is worth
 * 14 points and drags its genres along with it; a platform is 5, when
 * you're online is 5, region is 3. So the Top 5 goes first and gets the
 * strongest wording, because it is genuinely most of the answer.
 */
export function Welcome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    let active = true;
    needsWelcome().then((needed) => {
      if (active && needed) setOpen(true);
    });

    return () => {
      active = false;
    };
  }, [user]);

  // Closing hides it immediately and tells the server afterwards. If that
  // call fails they'd see this once more next session, which is a far
  // better failure than a dialog that sits there while the network sulks.
  function close(then?: string) {
    setOpen(false);
    markWelcomed();
    if (then) navigate(then);
  }

  // Escape closes it, and the page behind stops scrolling while it's up.
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const name =
    (user?.user_metadata?.display_name as string | undefined) ||
    (user?.user_metadata?.username as string | undefined) ||
    null;

  // Portalled to <body>. The shell and its panels are notched, and
  // clip-path clips every descendant — `position: fixed` included — so
  // rendered in place this gets cut to whatever box it sits inside.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/75 p-4 py-6 sm:items-center sm:p-6 sm:py-10"
      onClick={() => close()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      {/* Shadow on the wrapper — clip-path discards one set on the panel. */}
      <div className="float-shadow w-full max-w-lg">
        <div
          className="notch border border-line bg-surface"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-line bg-accent-dim px-6 py-5">
            <p className="label-wide mb-1 text-accent">
              <span aria-hidden="true">//</span> You're in
            </p>
            <h2 id="welcome-title" className="display text-2xl">
              {name ? `Welcome, ${name}` : "Welcome to Pentra"}
            </h2>
            <p className="mt-2 text-sm text-muted">
              Pentra matches you on what you actually play. A few minutes
              on your profile is what makes that work.
            </p>
          </div>

          <div className="px-6 py-5">
            <p className="label-wide mb-4 text-muted">
              Worth doing now, in this order
            </p>

            <ol className="space-y-4">
              <Step n={1} title="Pick your Top 5 games">
                The big one — a Top 5 pick counts for about three times a
                game sitting in your library.
              </Step>

              <Step n={2} title="Set your platforms">
                So you're not matched with someone you can't play with.
              </Step>

              <Step n={3} title="Say when you're online">
                Same games, opposite hours, is how most good matches die.
              </Step>

              <Step n={4} title="Add an avatar and a bio">
                It's what people check before accepting. An empty profile
                reads as a bot.
              </Step>
            </ol>

            <p className="mt-4 notch-md border border-line bg-surface-2 px-4 py-3 text-xs text-muted">
              Add your gamer tags too, so people can find you in-game and
              not just here.
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-line px-6 py-4 sm:flex-row-reverse">
            <button
              autoFocus
              onClick={() => close("/me")}
              className="label-wide notch-sm bg-accent px-5 py-2.5 text-onaccent transition hover:bg-accent-hi"
            >
              Set up my profile
            </button>
            <button
              onClick={() => close("/home")}
              className="label-wide notch-sm border border-line px-5 py-2.5 text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              Look around first
            </button>
          </div>

          <p className="px-6 pb-5 text-center text-xs text-muted sm:text-right">
            You can change any of it later from Profile.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className="numeric notch-sm mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-accent-edge bg-accent-dim text-xs font-bold text-accent"
        aria-hidden="true"
      >
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted">{children}</p>
      </div>
    </li>
  );
}
