import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { heartbeat } from "../lib/friends";
import { applyTheme } from "../lib/themes";
import { useNotifications } from "./Notifications";
import { Welcome } from "./Welcome";
import { ChangelogDialog } from "./ChangelogDialog";
import { NotificationBell } from "./NotificationBell";

/** `short` is the bottom-tab label. Seven of them share a phone's
    width — about 53px each at 375px — so these have to stay tiny:
    "Find players" becomes "Find", "Sessions" becomes "Play". */
type Item = { to: string; label: string; short: string; icon: ReactNode };

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const ITEMS: Item[] = [
  {
    to: "/home",
    label: "Home",
    short: "Home",
    icon: (
      <Icon d="m3 10.5 9-7 9 7V20a1.5 1.5 0 0 1-1.5 1.5h-4V14h-7v7.5h-4A1.5 1.5 0 0 1 3 20z" />
    ),
  },
  {
    to: "/me",
    label: "Profile",
    short: "You",
    icon: <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0" />,
  },
  {
    to: "/discover",
    label: "Find players",
    short: "Find",
    icon: <Icon d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3" />,
  },
  {
    to: "/sessions",
    label: "Sessions",
    short: "Play",
    icon: (
      <Icon d="M8 2v4M16 2v4M3.5 9.5h17M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5ZM8 13h3v3H8z" />
    ),
  },
  {
    to: "/friends",
    label: "Friends",
    short: "Friends",
    icon: (
      <Icon d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    ),
  },
  {
    to: "/messages",
    label: "Messages",
    short: "Chat",
    icon: <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  },
  {
    to: "/settings",
    label: "Settings",
    short: "More",
    icon: (
      <Icon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    ),
  },
];

/**
 * The frame every signed-in screen sits inside: a fixed sidebar on the left,
 * a slim bar with Back and Home across the top, scrolling content below.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { unread } = useNotifications();
  const [query, setQuery] = useState("");

  // Check in every minute while the app is open. This is what drives
  // the online dots and the recency part of match scoring - without it
  // everyone looks permanently offline.
  useEffect(() => {
    if (!user) return;

    heartbeat();
    const timer = setInterval(heartbeat, 60_000);
    return () => clearInterval(timer);
  }, [user]);

  // One palette now, so there's nothing to fetch or reconcile — just
  // make sure the variables are on the root element. See lib/themes.ts
  // for why the twenty-four went away.
  useEffect(() => {
    applyTheme();
  }, []);

  // React Router tracks position in history as `idx`. At 0 there's
  // nothing behind us, so Back would do nothing - better to grey it out
  // than to have a button that silently ignores you.
  const historyIndex =
    (window.history.state as { idx?: number } | null)?.idx ?? 0;
  const canGoBack = historyIndex > 0;

  const atHome = location.pathname === "/home";

  return (
    <div className="flex h-full">
      {/* Lives in the frame rather than on Home, so it finds a new
          player wherever they happen to land first. It decides for
          itself whether to appear. */}
      <Welcome />
      {/* Suppressed in the database while the welcome is pending, so
          these two can never stack on a first run. */}
      <ChangelogDialog />

      {/* Sidebar — desktop only. On a phone 224px of permanent chrome is
          most of the screen, so below md this is replaced by the bottom
          tab bar at the end of this component. */}
      <nav className="relative z-10 hidden w-56 shrink-0 flex-col border-r border-line bg-surface/85 backdrop-blur-sm md:flex">
        {/* The wordmark. Two slashes rather than a logo for now — a
            mark that's only ever type is easier to keep consistent than
            one badly-drawn icon, and it scales to a favicon. */}
        <div className="display px-5 py-6 text-xl">
          <span className="text-accent">//</span> PENTRA
        </div>

        <div className="flex-1 space-y-1 px-3">
          {ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                "label-wide flex items-center gap-3 px-3 py-2.5 transition " +
                (isActive
                  ? "notch-sm bg-accent text-onaccent"
                  : "text-muted hover:bg-surface-2 hover:text-ink")
              }
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>

              {/* Unread count, so a message isn't missed while you're
                  on another screen. */}
              {item.to === "/messages" && unread > 0 && (
                <span className="numeric bg-ink px-1.5 py-0.5 text-[10px] font-bold text-bg">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </NavLink>
          ))}
        </div>

        <div className="border-t border-line p-3">
          <p className="mb-2 truncate px-2 text-xs text-muted" title={user?.email ?? ""}>
            {user?.email}
          </p>
          <button
            onClick={signOut}
            className="label-wide w-full px-3 py-2 text-left text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        {/* Top bar. Translucent so a profile background reads through it. */}
        <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-surface/70 px-3 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={!canGoBack}
            title="Back"
            aria-label="Back"
            className="label-wide flex items-center gap-1.5 px-2.5 py-1.5 text-muted transition hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
          >
            <Icon d="m15 18-6-6 6-6" className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </button>

          {/* Forward and Home are desktop affordances — phones have a
              system back gesture and the tab bar covers Home. */}
          <button
            type="button"
            onClick={() => navigate(1)}
            title="Forward"
            aria-label="Forward"
            className="hidden px-2 py-1.5 text-muted transition hover:bg-surface-2 hover:text-ink md:block"
          >
            <Icon d="m9 18 6-6-6-6" className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => navigate("/home")}
            disabled={atHome}
            title="Home"
            aria-label="Home"
            className="label-wide ml-1 hidden items-center gap-1.5 px-2.5 py-1.5 text-muted transition hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-30 md:flex"
          >
            <Icon d="m3 10.5 9-7 9 7V20a1.5 1.5 0 0 1-1.5 1.5h-4V14h-7v7.5h-4A1.5 1.5 0 0 1 3 20z" className="h-4 w-4" />
            Home
          </button>

          {/* The wordmark only appears here on mobile, where the sidebar
              that normally carries it is hidden. */}
          <div className="display ml-1 text-base md:hidden">
            <span className="text-accent">//</span> PENTRA
          </div>

          {/* Looking up one specific person is something you do from
              anywhere, so the box lives in the frame rather than on a
              screen you'd have to navigate to first. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const term = query.trim();
              if (term.length < 2) return;
              navigate(`/search?q=${encodeURIComponent(term)}`);
              setQuery("");
            }}
            className="relative ml-auto hidden w-64 md:block"
          >
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.3-4.3" />
            </svg>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={60}
              placeholder="Find someone by name or code"
              aria-label="Find a player"
              className="notch-sm w-full border border-line bg-surface-2/70 py-1.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted focus:border-accent focus:bg-surface-2"
            />
          </form>

          <div className="ml-auto md:ml-0">
            <NotificationBell />
          </div>

          {/* On mobile the box won't fit beside the wordmark, so search
              becomes a button that opens the screen built for it. */}
          <button
            type="button"
            onClick={() => navigate("/search")}
            aria-label="Find a player"
            title="Find a player"
            className="p-2 text-muted transition hover:text-ink md:hidden"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </button>
        </header>

        {/* Keyed on the path so each screen arrives rather than
            appearing — the cheapest thing that makes an app feel built
            rather than assembled. */}
        <main
          key={location.pathname}
          className="rise flex-1 overflow-y-auto pb-[4.5rem] md:pb-0"
        >
          {children}
        </main>
      </div>

      {/* Bottom tab bar — mobile only, and the sidebar's replacement.
          Fixed rather than sticky so it survives any scroll container,
          and it carries the iOS home-indicator inset so the last row of
          labels isn't sitting under the bar on a notched phone. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 backdrop-blur-sm md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={item.label}
            className={({ isActive }) =>
              "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[9px] font-bold uppercase tracking-wider transition " +
              (isActive ? "text-accent" : "text-muted")
            }
          >
            {({ isActive }) => (
              <>
                {/* A bar above the active tab rather than a filled block:
                    at this size a solid accent chip swamps the icon. */}
                <span
                  className={
                    "absolute inset-x-3 top-0 h-0.5 " +
                    (isActive ? "bg-accent" : "bg-transparent")
                  }
                />
                {item.icon}
                <span className="leading-none">{item.short}</span>

                {item.to === "/messages" && unread > 0 && (
                  <span className="numeric absolute right-1/2 top-1 -mr-3 bg-accent px-1 text-[9px] font-bold text-onaccent">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Placeholder for destinations that arrive in a later phase. */
export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 sm:p-10 text-center">
      <div className="max-w-sm">
        <h1 className="mb-2 text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted">{note}</p>
      </div>
    </div>
  );
}
