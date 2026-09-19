import { useEffect, useMemo, useState } from "react";
import { getFriendList, isOnline, type FriendRow } from "../lib/friends";
import { Avatar } from "./Avatar";

/**
 * Picking which friends are already in, while posting a session.
 *
 * Only accepted friends appear, which is the same rule the database
 * enforces — you can't put a stranger's name on your session.
 *
 * Friends who are online come first. If three people are in the app
 * right now, those are the three most likely to be the ones you just
 * agreed to play with.
 */
export function SessionGuests({
  selected,
  onChange,
  max,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  /** Slots left after the host takes theirs. */
  max: number;
}) {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    getFriendList().then((rows) => {
      setFriends(rows.filter((r) => r.direction === "friend"));
      setLoading(false);
    });
  }, []);

  // Anyone selected beyond the new limit gets dropped when the host
  // lowers the slot count, rather than being silently rejected later.
  useEffect(() => {
    if (selected.length > max) onChange(selected.slice(0, max));
  }, [max, selected, onChange]);

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
      const online = Number(isOnline(b.last_seen_at)) - Number(isOnline(a.last_seen_at));
      if (online !== 0) return online;
      return (a.display_name || a.username).localeCompare(
        b.display_name || b.username,
      );
    });
  }, [friends, filter]);

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else if (selected.length < max) {
      onChange([...selected, id]);
    }
  }

  if (loading) {
    return (
      <p className="mt-2 w-full text-xs text-muted">Loading your friends…</p>
    );
  }

  if (friends.length === 0) {
    return (
      <p className="mt-2 w-full text-xs text-muted">
        No friends yet — anyone can still join this session from the feed.
      </p>
    );
  }

  const full = selected.length >= max;

  return (
    <div className="mt-2 w-full border-t border-accent/20 pt-2.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-muted">Already playing</span>

        {selected.length > 0 && (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
            {selected.length} added
          </span>
        )}

        {friends.length > 6 && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter"
            className="ml-auto w-28 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs outline-none focus:border-accent"
          />
        )}
      </div>

      <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
        {shown.map((friend) => {
          const on = selected.includes(friend.other_id);
          const blocked = !on && full;

          return (
            <button
              key={friend.other_id}
              type="button"
              onClick={() => toggle(friend.other_id)}
              disabled={blocked}
              title={
                blocked
                  ? "No slots left — add more players above"
                  : friend.display_name || friend.username
              }
              className={
                "flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition " +
                (on
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line text-muted hover:border-muted hover:text-ink disabled:opacity-40")
              }
            >
              <span className="relative">
                <Avatar of={friend} size={22} />
                {isOnline(friend.last_seen_at) && (
                  <span className="absolute -bottom-px -right-px h-2 w-2 rounded-full border border-surface bg-ok" />
                )}
              </span>
              <span className="max-w-24 truncate">
                {friend.display_name || friend.username}
              </span>
              {on && <span aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 text-[11px] text-muted">
        {full
          ? "Every slot is spoken for. Raise the player count to add more."
          : "They'll be shown as playing straight away, and can leave if plans change."}
      </p>
    </div>
  );
}
