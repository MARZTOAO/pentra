import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { getProfile, type Profile as ProfileRow } from "../lib/profile";
import {
  searchPlayers,
  looksLikeCode,
  formatCode,
  type SearchResult,
} from "../lib/search";
import {
  sendFriendRequest,
  removeFriend,
  isOnline,
  type FriendStatus,
} from "../lib/friends";
import { formatLocation } from "../lib/constants";
import { Avatar } from "../components/Avatar";
import { FriendCode } from "../components/FriendCode";

/**
 * Finding one specific person.
 *
 * Deliberately separate from Find players, which is for meeting
 * strangers. This screen answers "my friend told me their name is
 * ashfallen" and "they sent me a code" — two different questions from
 * "who should I play with", and a ranked match list is the wrong shape
 * for both.
 */
export default function Search() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [ran, setRan] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  // Every keystroke firing a request would be one request per letter.
  // A short pause after typing stops is the usual compromise.
  const timer = useRef<number | null>(null);
  // Responses can come back out of order; only the newest one counts.
  const latest = useRef(0);
  // The last term this screen itself put in the URL. Anything else
  // appearing there came from outside - the box in the top bar, or the
  // back button - and should replace what's typed.
  const pushed = useRef(params.get("q") ?? "");

  useEffect(() => {
    if (!user) return;
    getProfile(user.id).then(({ data }) => {
      if (data) setProfile(data as ProfileRow);
    });
  }, [user]);

  const run = useCallback(async (text: string) => {
    const term = text.trim();

    if (term.length < 2) {
      setResults([]);
      setRan(false);
      setSearching(false);
      return;
    }

    const ticket = ++latest.current;
    setSearching(true);

    const rows = await searchPlayers(term);

    if (ticket !== latest.current) return;

    setResults(rows);
    setSearching(false);
    setRan(true);
  }, []);

  // Keep the URL in step, so a search survives a reload and can be
  // linked to from the top bar.
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);

    timer.current = window.setTimeout(() => {
      run(q);
      pushed.current = q.trim();
      setParams(q.trim() ? { q: q.trim() } : {}, { replace: true });
    }, 250);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // setParams identity changes every render in some router versions;
    // leaving it out keeps this from re-running forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, run]);

  // A new term arriving in the URL from somewhere else takes over.
  useEffect(() => {
    const incoming = params.get("q") ?? "";
    if (incoming !== pushed.current) {
      pushed.current = incoming;
      setQ(incoming);
    }
  }, [params]);

  const codeSearch = looksLikeCode(q);

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <header className="mb-6">
        <h1 className="display text-2xl">Find someone</h1>
        <p className="mt-1 text-sm text-muted">
          Search by username, display name, or friend code.
        </p>
      </header>

      <div className="relative mb-2">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.3-4.3" />
        </svg>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          maxLength={60}
          placeholder="ashfallen, or A1B2C-3D4E5"
          className="w-full notch border border-line bg-surface-2 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>

      <p className="mb-6 h-4 text-xs text-muted">
        {codeSearch
          ? `Looking up friend code ${formatCode(q)}`
          : q.trim().length === 1
            ? "Two characters or more."
            : ""}
      </p>

      {searching && results.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">Searching…</p>
      )}

      {!searching && ran && results.length === 0 && (
        <Empty>
          {codeSearch ? (
            <>
              No one has the code <strong>{formatCode(q)}</strong>. Codes get
              misheard — check it with them, and remember the letters I, L, O
              and U never appear in one.
            </>
          ) : (
            <>
              Nothing matching “{q.trim()}”. Try fewer characters, or ask them
              for their friend code.
            </>
          )}
        </Empty>
      )}

      {results.length > 0 && (
        <div className="mb-10 space-y-2">
          {results.map((row) => (
            <ResultRow key={row.user_id} row={row} />
          ))}
        </div>
      )}

      {!ran && !searching && (
        <div className="mb-10">
          <Empty>
            Type a name, or paste the code a friend gave you.
          </Empty>
        </div>
      )}

      <FriendCode code={profile?.friend_code} />
    </div>
  );
}

function ResultRow({ row }: { row: SearchResult }) {
  const [status, setStatus] = useState<FriendStatus>(row.friend_status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const online = isOnline(row.last_seen_at);
  const where = formatLocation(row);

  async function act(fn: () => Promise<{ error: unknown }>, next: FriendStatus) {
    setBusy(true);
    setError(null);

    const { error } = await fn();

    setBusy(false);

    if (error) setError((error as { message?: string }).message ?? "Failed");
    else setStatus(next);
  }

  return (
    <div
      className={
        "notch border bg-surface p-3 transition " +
        (row.matched_code ? "border-accent/60" : "border-line")
      }
    >
      <div className="flex items-center gap-3">
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
            {row.primary_platform && <> · {row.primary_platform}</>}
            {where && <> · {where}</>}
          </p>
        </Link>

        <div className="shrink-0">
          {status === "none" && (
            <button
              disabled={busy}
              onClick={() => act(() => sendFriendRequest(row.user_id), "outgoing")}
              className="notch-md bg-accent px-3 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-50"
            >
              {busy ? "…" : "Add friend"}
            </button>
          )}

          {/* They asked first — adding them back just accepts. */}
          {status === "incoming" && (
            <button
              disabled={busy}
              onClick={() => act(() => sendFriendRequest(row.user_id), "friend")}
              className="notch-md bg-ok px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "…" : "Accept"}
            </button>
          )}

          {status === "outgoing" && (
            <button
              disabled={busy}
              onClick={() => act(() => removeFriend(row.user_id), "none")}
              className="notch-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-muted hover:text-ink disabled:opacity-50"
            >
              {busy ? "…" : "Cancel"}
            </button>
          )}

          {status === "friend" && (
            <span className="notch-md border border-ok/50 px-3 py-1.5 text-xs font-semibold text-ok">
              Friends
            </span>
          )}
        </div>
      </div>

      {row.matched_code && (
        <p className="mt-2 pl-[56px] text-xs text-accent">
          Matched their friend code
        </p>
      )}

      {error && <p className="mt-2 pl-[56px] text-xs text-danger">{error}</p>}
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
