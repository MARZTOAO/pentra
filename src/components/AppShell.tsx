import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

type Item = { to: string; label: string; icon: ReactNode };

function Icon({ d }: { d: string }) {
  return (
    <svg
      className="h-5 w-5"
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
    to: "/me",
    label: "Profile",
    icon: <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0" />,
  },
  {
    to: "/discover",
    label: "Find players",
    icon: <Icon d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3" />,
  },
  {
    to: "/friends",
    label: "Friends",
    icon: (
      <Icon d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    ),
  },
  {
    to: "/messages",
    label: "Messages",
    icon: <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  },
  {
    to: "/settings",
    label: "Settings",
    icon: (
      <Icon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    ),
  },
];

/**
 * The frame every signed-in screen sits inside: a fixed sidebar on the left,
 * scrolling content on the right. Roughly the shape Discord uses, because
 * it's the shape this audience already knows.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <div className="flex h-full">
      <nav className="flex w-56 shrink-0 flex-col border-r border-line bg-surface">
        <div className="px-5 py-5 text-lg font-bold tracking-tight">
          <span className="text-accent">▲</span> Gamer Social
        </div>

        <div className="flex-1 space-y-1 px-3">
          {ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition " +
                (isActive
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:bg-surface-2 hover:text-ink")
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="border-t border-line p-3">
          <p className="mb-2 truncate px-2 text-xs text-muted" title={user?.email ?? ""}>
            {user?.email}
          </p>
          <button
            onClick={signOut}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

/** Placeholder for destinations that arrive in a later phase. */
export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex h-full items-center justify-center p-10 text-center">
      <div className="max-w-sm">
        <h1 className="mb-2 text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted">{note}</p>
      </div>
    </div>
  );
}
