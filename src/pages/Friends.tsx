import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getFriendList,
  respondToRequest,
  removeFriend,
  isOnline,
  type FriendRow,
} from "../lib/friends";
import { lastSeenLabel } from "../lib/matching";
import { Alert, FullScreenLoader } from "../components/ui";
import { Avatar } from "../components/Avatar";

export default function Friends() {
  const [rows, setRows] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await getFriendList());
    setLoading(false);
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
    <div className="mx-auto max-w-2xl px-8 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Friends</h1>
        <p className="mt-1 text-sm text-muted">
          {friends.length === 0
            ? "Nobody yet."
            : `${friends.length} ${friends.length === 1 ? "friend" : "friends"}` +
              `, ${friends.filter((f) => isOnline(f.last_seen_at)).length} online`}
        </p>
      </header>

      {error && <Alert>{error}</Alert>}

      {/* Requests waiting on you go first - they're the only rows
          here that need a decision. */}
      {incoming.length > 0 && (
        <Section title={`Waiting on you (${incoming.length})`}>
          {incoming.map((row) => (
            <Row key={row.friendship_id} row={row}>
              <button
                disabled={busy === row.other_id}
                onClick={() => respond(row, true)}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-50"
              >
                Accept
              </button>
              <button
                disabled={busy === row.other_id}
                onClick={() => respond(row, false)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-muted hover:text-ink disabled:opacity-50"
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
            No friends yet.{" "}
            <Link to="/discover" className="text-accent hover:underline">
              Find players
            </Link>{" "}
            and send a few requests.
          </Empty>
        ) : (
          friends.map((row) => (
            <Row key={row.friendship_id} row={row}>
              <button
                disabled={busy === row.other_id}
                onClick={() => remove(row)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-danger hover:text-danger disabled:opacity-50"
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
            <Row key={row.friendship_id} row={row}>
              <span className="text-xs text-muted">Waiting</span>
              <button
                disabled={busy === row.other_id}
                onClick={() => remove(row)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-muted hover:text-ink disabled:opacity-50"
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
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({
  row,
  children,
}: {
  row: FriendRow;
  children: React.ReactNode;
}) {
  const online = isOnline(row.last_seen_at);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
      <Link to={`/u/${row.username}`} className="relative shrink-0">
        <Avatar of={row} size={44} />
        {online && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-ok" />
        )}
      </Link>

      <Link to={`/u/${row.username}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {row.display_name || row.username}
        </p>
        <p className="truncate text-xs text-muted">
          @{row.username}
          {row.direction === "friend" && (
            <> · {online ? "online" : (lastSeenLabel(row.last_seen_at) ?? "offline")}</>
          )}
        </p>
      </Link>

      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
      {children}
    </p>
  );
}
