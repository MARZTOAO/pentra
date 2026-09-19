import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getFriendList,
  respondToRequest,
  removeFriend,
  type FriendRow,
} from "../lib/friends";
import {
  getPresenceMap,
  presenceOf,
  PRESENCE_LABEL,
  type PresenceState,
} from "../lib/presence";
import { StatusDot } from "../components/StatusDot";
import { lastSeenLabel } from "../lib/matching";
import { Alert, FullScreenLoader } from "../components/ui";
import { Avatar } from "../components/Avatar";

/** Folds the batched presence lookup into a row that only has last_seen_at. */
function stateOf(
  row: { other_id: string; last_seen_at: string | null },
  map: Record<string, string>,
): PresenceState {
  return presenceOf({
    presence: map[row.other_id],
    last_seen_at: row.last_seen_at,
  });
}

export default function Friends() {
  const [rows, setRows] = useState<FriendRow[]>([]);
  // The friend-list RPC predates presence and doesn't return it, so it
  // comes alongside in one batched lookup. See lib/presence.ts.
  const [presence, setPresence] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await getFriendList();
    setRows(list);
    setLoading(false);
    setPresence(await getPresenceMap(list.map((r) => r.other_id)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function respond(row: FriendRow, accept: boolean) {
    setBusy(row.other_id);
    setError(null);

    const { error } = await respondToRequest(row.friendship_id, accept);

    setBusy(null);
    if (error) setError(error.message);
    else load();
  }

  async function remove(row: FriendRow) {
    setBusy(row.other_id);
    setError(null);

    const { error } = await removeFriend(row.other_id);

    setBusy(null);
    if (error) setError(error.message);
    else load();
  }

  if (loading) return <FullScreenLoader />;

  const incoming = rows.filter((r) => r.direction === "incoming");
  const friends = rows.filter((r) => r.direction === "friend");
  const outgoing = rows.filter((r) => r.direction === "outgoing");

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-8 py-6 sm:py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="display text-2xl">Friends</h1>
          <p className="mt-1 text-sm text-muted">
            {friends.length === 0
              ? "Nobody yet."
              : `${friends.length} ${friends.length === 1 ? "friend" : "friends"}` +
                `, ${friends.filter((f) => stateOf(f, presence) !== "offline").length} online`}
          </p>
        </div>

        <Link
          to="/search"
          className="shrink-0 notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi"
        >
          Add a friend
        </Link>
      </header>

      {error && <Alert>{error}</Alert>}

      {/* Requests waiting on you go first - they're the only rows
          here that need a decision. */}
      {incoming.length > 0 && (
        <Section title={`Waiting on you (${incoming.length})`}>
          {incoming.map((row) => (
            <Row key={row.friendship_id} row={row} state={stateOf(row, presence)}>
              <button
                disabled={busy === row.other_id}
                onClick={() => respond(row, true)}
                className="notch-md bg-accent px-3 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-50"
              >
                Accept
              </button>
              <button
                disabled={busy === row.other_id}
                onClick={() => respond(row, false)}
                className="notch-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-muted hover:text-ink disabled:opacity-50"
              >
                Decline
              </button>
            </Row>
          ))}
        </Section>
      )}

      <Section title="Friends">
        {friends.length === 0 ? (
          <Empty>
            No friends yet. If you already know someone here,{" "}
            <Link to="/search" className="text-accent hover:underline">
              search for them
            </Link>{" "}
            by name or friend code — otherwise{" "}
            <Link to="/discover" className="text-accent hover:underline">
              find players
            </Link>{" "}
            and send a few requests.
          </Empty>
        ) : (
          friends.map((row) => (
            <Row key={row.friendship_id} row={row} state={stateOf(row, presence)}>
              <button
                disabled={busy === row.other_id}
                onClick={() => remove(row)}
                className="notch-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-danger hover:text-danger disabled:opacity-50"
              >
                Remove
              </button>
            </Row>
          ))
        )}
      </Section>

      {outgoing.length > 0 && (
        <Section title={`Sent (${outgoing.length})`}>
          {outgoing.map((row) => (
            <Row key={row.friendship_id} row={row} state={stateOf(row, presence)}>
              <span className="text-xs text-muted">Waiting</span>
              <button
                disabled={busy === row.other_id}
                onClick={() => remove(row)}
                className="notch-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-muted hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
            </Row>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 label-wide text-muted">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({
  row,
  state,
  children,
}: {
  row: FriendRow;
  state: PresenceState;
  children: React.ReactNode;
}) {
  const online = state !== "offline";

  return (
    <div className="flex items-center gap-3 notch border border-line bg-surface p-3">
      <Link to={`/u/${row.username}`} className="relative shrink-0">
        <Avatar of={row} size={44} />
        {online && (
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-surface">
            <StatusDot state={state} size={11} />
          </span>
        )}
      </Link>

      <Link to={`/u/${row.username}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {row.display_name || row.username}
        </p>
        <p className="truncate text-xs text-muted">
          @{row.username}
          {row.direction === "friend" && (
            <>
              {" · "}
              {online
                ? PRESENCE_LABEL[state]
                : (lastSeenLabel(row.last_seen_at) ?? "offline")}
            </>
          )}
        </p>
      </Link>

      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="notch border border-dashed border-line p-8 text-center text-sm text-muted">
      {children}
    </p>
  );
}
