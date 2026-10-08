import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getFriendList, type FriendRow } from "../lib/friends";
import { getPresenceMap, presenceOf } from "../lib/presence";
import { addGroupMembers, createGroup } from "../lib/chat";
import { Avatar } from "./Avatar";
import { StatusDot } from "./StatusDot";

/**
 * Picking friends for a group chat (supabase/108): either making a new
 * group (a name plus people) or adding people to one you're in.
 *
 * Friends only, in the picker. The database allows anyone you could
 * message directly, but a list of every player on Pentra isn't a
 * picker, it's a search; friends who are online come first because
 * they're the ones you can actually talk to right now.
 */
export function GroupChatDialog({
  mode,
  conversationId,
  /** Already in the group — shown, not pickable. */
  members = [],
  onDone,
  onClose,
}: {
  mode: "create" | "add";
  conversationId?: number;
  members?: string[];
  /** The group's id, new or existing, once people are in it. */
  onDone: (conversationId: number) => void;
  onClose: () => void;
}) {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [presence, setPresence] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stateOf = (row: FriendRow) =>
    presenceOf({ presence: presence[row.other_id], last_seen_at: row.last_seen_at });
  const here = (row: FriendRow) => stateOf(row) !== "offline";

  useEffect(() => {
    getFriendList().then(async (rows) => {
      const mine = rows.filter((r) => r.direction === "friend");
      setFriends(mine);
      setLoading(false);
      setPresence(await getPresenceMap(mine.map((r) => r.other_id)));
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matching = needle
      ? friends.filter(
          (f) =>
            f.username.toLowerCase().includes(needle) ||
            (f.display_name ?? "").toLowerCase().includes(needle),
        )
      : friends;
    return [...matching].sort((a, b) => {
      const online = Number(here(b)) - Number(here(a));
      if (online !== 0) return online;
      return (a.display_name || a.username).localeCompare(b.display_name || b.username);
    });
  }, [friends, filter, presence]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setError(null);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  const canGo = mode === "create" ? name.trim().length > 0 : picked.length > 0;

  async function go() {
    if (!canGo || busy) return;
    setBusy(true);
    setError(null);

    const r =
      mode === "create"
        ? await createGroup(name, picked)
        : await addGroupMembers(conversationId!, picked);

    setBusy(false);

    if (typeof r === "string") {
      setError(r);
      return;
    }
    onDone(mode === "create" ? r : conversationId!);
    onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-10 sm:p-6 sm:pt-20"
      onClick={onClose}
    >
      <div className="float-shadow w-full max-w-md">
        <div className="w-full overflow-hidden notch border border-line bg-surface" onClick={(e) => e.stopPropagation()}>
          <div className="border-b border-line p-4">
            <h2 className="mb-1 text-sm font-semibold">{mode === "create" ? "New group" : "Add people"}</h2>
            <p className="text-xs text-muted">
              {mode === "create"
                ? "Name it and pick who's in. Anyone in the group can add more people later."
                : "Pick who to add. They'll see messages from now on."}
            </p>

            {mode === "create" && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Group name"
                maxLength={60}
                autoFocus
                className="mt-3 w-full notch-md border border-line bg-surface-2 px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            )}

            {friends.length > 6 && (
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter friends"
                className="mt-2 w-full notch-md border border-line bg-surface-2 px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            )}
          </div>

          <div className="max-h-[45vh] overflow-y-auto p-3">
            {loading ? (
              <p className="p-4 text-center text-sm text-muted">Loading…</p>
            ) : friends.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted">
                No friends yet. Add some and they'll show up here.
              </p>
            ) : shown.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted">Nobody matches “{filter.trim()}”.</p>
            ) : (
              <ul className="space-y-1">
                {shown.map((friend) => {
                  const already = members.includes(friend.other_id);
                  const on = picked.includes(friend.other_id);
                  return (
                    <li key={friend.other_id}>
                      <button
                        type="button"
                        onClick={() => toggle(friend.other_id)}
                        disabled={already}
                        className={
                          "flex w-full items-center gap-2.5 notch-md border px-2.5 py-2 text-left text-sm transition " +
                          (on
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-transparent hover:border-line hover:bg-surface-2 disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-transparent")
                        }
                      >
                        <span className="relative shrink-0">
                          <Avatar of={friend} size={30} />
                          {here(friend) && (
                            <span className="absolute -bottom-px -right-px rounded-full border border-surface">
                              <StatusDot state={stateOf(friend)} size={8} />
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{friend.display_name || friend.username}</span>
                        {already ? (
                          <span className="text-2xs text-muted">in the group</span>
                        ) : on ? (
                          <span className="text-2xs font-semibold">✓</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line p-3">
            <span className="text-xs text-muted">
              {error ?? (picked.length ? `${picked.length} picked` : mode === "create" ? "You can add people later too" : "")}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="notch-md border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={go}
                disabled={!canGo || busy}
                className="notch-md bg-accent px-4 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
              >
                {busy ? "…" : mode === "create" ? "Create" : "Add"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
