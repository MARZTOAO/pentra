import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getFriendList, type FriendRow } from "../lib/friends";
import { getPresenceMap, presenceOf } from "../lib/presence";
import { inviteToSession } from "../lib/invites";
import { Avatar } from "./Avatar";
import { StatusDot } from "./StatusDot";

/**
 * Picking friends to invite into a session you're already in.
 *
 * The composer's version of this (SessionGuests) seats people
 * outright, because the host is recording an arrangement that already
 * exists. This one asks, because you are speaking for somebody else's
 * evening — so it holds the slot and waits.
 *
 * Friends who are online come first. If three people are in the app
 * right now, those are the three you can realistically get tonight.
 */
export function InviteFriends({
  postId,
  slotsFree,
  /** Already playing or already invited — shown, but not pickable. */
  unavailable,
  onDone,
  onClose,
}: {
  postId: number;
  slotsFree: number;
  unavailable: string[];
  onDone: () => void;
  onClose: () => void;
}) {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [presence, setPresence] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stateOf = (row: FriendRow) =>
    presenceOf({
      presence: presence[row.other_id],
      last_seen_at: row.last_seen_at,
    });
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
      return (a.display_name || a.username).localeCompare(
        b.display_name || b.username,
      );
    });
  }, [friends, filter, presence]);

  function toggle(id: string) {
    setError(null);
    if (picked.includes(id)) setPicked(picked.filter((x) => x !== id));
    else if (picked.length < slotsFree) setPicked([...picked, id]);
  }

  async function send() {
    if (picked.length === 0 || busy) return;

    setBusy(true);
    setError(null);

    const { error: problem } = await inviteToSession(postId, picked);

    setBusy(false);

    if (problem) {
      setError(problem.message);
      return;
    }

    onDone();
    onClose();
  }

  // Portalled to <body>: the session card is notched, and clip-path
  // clips every descendant including `position: fixed`. Rendered in
  // place it gets cut to the card's box.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-10 sm:p-6 sm:pt-20"
      onClick={onClose}
    >
      {/* Shadow on the wrapper — clip-path drops one set on the panel. */}
      <div className="float-shadow w-full max-w-md">
        <div
          className="w-full overflow-hidden notch border border-line bg-surface"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-line p-4">
            <h2 className="mb-1 text-sm font-semibold">Invite friends</h2>
            <p className="text-xs text-muted">
              They'll hold a slot until they answer.{" "}
              {slotsFree === 1
                ? "One slot left."
                : `${slotsFree} slots left.`}
            </p>

            {friends.length > 6 && (
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter"
                className="mt-3 w-full notch-md border border-line bg-surface-2 px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            )}
          </div>

          {/* Capped against the viewport rather than at a fixed 18rem.
              Measured at 320x568 the fixed version put the Invite
              button 37px from the bottom edge — technically on screen,
              and gone the moment a browser draws its own toolbar. */}
          <div className="max-h-[45vh] overflow-y-auto p-3">
            {loading ? (
              <p className="p-4 text-center text-sm text-muted">Loading…</p>
            ) : friends.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted">
                No friends yet. Anyone can still join this session from the
                feed.
              </p>
            ) : shown.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted">
                Nobody matches “{filter.trim()}”.
              </p>
            ) : (
              <ul className="space-y-1">
                {shown.map((friend) => {
                  const already = unavailable.includes(friend.other_id);
                  const on = picked.includes(friend.other_id);
                  const noRoom = !on && !already && picked.length >= slotsFree;

                  return (
                    <li key={friend.other_id}>
                      <button
                        type="button"
                        onClick={() => toggle(friend.other_id)}
                        disabled={already || noRoom}
                        title={
                          already
                            ? "Already in this session"
                            : noRoom
                              ? "No slots left"
                              : friend.display_name || friend.username
                        }
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

                        <span className="min-w-0 flex-1 truncate">
                          {friend.display_name || friend.username}
                        </span>

                        {already ? (
                          <span className="shrink-0 text-[11px] text-muted">
                            In
                          </span>
                        ) : on ? (
                          <span className="shrink-0" aria-hidden="true">
                            ✓
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error && (
            <p className="px-4 pb-1 text-xs text-danger">{error}</p>
          )}

          <div className="flex items-center gap-2 border-t border-line p-3">
            <button
              type="button"
              onClick={onClose}
              className="label-wide notch-sm border border-line px-3 py-1.5 text-muted transition hover:text-ink"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={send}
              disabled={busy || picked.length === 0}
              className="label-wide ml-auto notch-sm bg-accent px-4 py-1.5 text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
            >
              {busy
                ? "Sending…"
                : picked.length === 0
                  ? "Invite"
                  : `Invite ${picked.length}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
