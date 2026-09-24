import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  findPlayers,
  touchLastSeen,
  PAGE_SIZE,
  type Match,
} from "../lib/matching";
import { getTopFive, type TopFiveEntry } from "../lib/topFive";
import { useAuth } from "../lib/AuthContext";
import { PLATFORMS, REGIONS } from "../lib/constants";
import { Alert, FullScreenLoader } from "../components/ui";
import { MatchCard } from "../components/MatchCard";

export default function Discover() {
  const { user } = useAuth();

  const [matches, setMatches] = useState<Match[]>([]);
  const [myTopFive, setMyTopFive] = useState<TopFiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [gameId, setGameId] = useState<number | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);

  // Pages count from 0. `total` is how many match the filters in all,
  // straight from the database, so the page count is exact. Every
  // filter change below also resets to page 0 — in the same handler,
  // so React batches it into one fetch rather than two.
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Load my Top 5 once, to populate the game filter.
  useEffect(() => {
    if (!user) return;
    getTopFive(user.id).then(setMyTopFive);
    touchLastSeen();
  }, [user]);

  // If the game filter points at something no longer in your Top 5 —
  // because you just removed it — clear it. Otherwise the list silently
  // filters on a game you don't have and looks empty for no visible
  // reason, since the dropdown can't show the missing option either.
  useEffect(() => {
    if (gameId === null || myTopFive.length === 0) return;
    if (!myTopFive.some((e) => e.game.id === gameId)) {
      setGameId(null);
      setPage(0);
    }
  }, [myTopFive, gameId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await findPlayers({ gameId, platform, region }, page);

    if (error) {
      setError(error.message);
    } else {
      const rows = (data ?? []) as Match[];
      const count = rows.length > 0 ? Number(rows[0].total_count) : 0;

      // A refresh can find fewer players than before — someone became a
      // friend, or blocked you — and leave this page past the end. Go
      // back to page 1 rather than showing an empty list that claims
      // nobody matches.
      if (rows.length === 0 && page > 0) {
        setPage(0);
        return;
      }

      setMatches(rows);
      setTotal(count);
    }

    setLoading(false);
  }, [gameId, platform, region, page]);

  function goTo(next: number) {
    setPage(next);
    // The list is long; land at the top of the new page, not the bottom.
    document.querySelector("main")?.scrollTo({ top: 0 });
  }

  useEffect(() => {
    load();
  }, [load]);

  // Matching is computed from your Top 5 and your library, so results go
  // stale the moment you edit either — and editing them happens on a
  // different screen, or in a different tab. Refetch whenever this tab
  // becomes visible again, and reload the Top 5 the game filter is built
  // from at the same time, so a game you dropped stops being offered.
  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== "visible") return;
      load();
      if (user) getTopFive(user.id).then(setMyTopFive);
    }

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, user]);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-8 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="display text-2xl">Find players</h1>
        <p className="mt-1 text-sm text-muted">
          Ranked by how much you have in common, best match first. Every
          result says why.
        </p>
      </header>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Select
          value={gameId === null ? "" : String(gameId)}
          onChange={(v) => {
            setGameId(v ? Number(v) : null);
            setPage(0);
          }}
          placeholder="Any of my games"
          options={myTopFive.map((e) => ({
            value: String(e.game.id),
            label: e.game.name,
          }))}
        />
        <Select
          value={platform ?? ""}
          onChange={(v) => {
            setPlatform(v || null);
            setPage(0);
          }}
          placeholder="Any platform"
          options={PLATFORMS.map((p) => ({ value: p, label: p }))}
        />
        <Select
          value={region ?? ""}
          onChange={(v) => {
            setRegion(v || null);
            setPage(0);
          }}
          placeholder="Any region"
          options={REGIONS.map((r) => ({ value: r, label: r }))}
        />

        {(gameId || platform || region) && (
          <button
            onClick={() => {
              setGameId(null);
              setPlatform(null);
              setRegion(null);
              setPage(0);
            }}
            className="notch-md px-3 py-2 text-sm text-muted transition hover:text-ink"
          >
            Clear
          </button>
        )}
      </div>

      {error && <Alert>{error}</Alert>}

      {loading ? (
        <FullScreenLoader />
      ) : matches.length === 0 ? (
        <EmptyState hasFilters={Boolean(gameId || platform || region)} />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            <span className="numeric">
              {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + matches.length}
            </span>{" "}
            of <span className="numeric">{total}</span>{" "}
            {total === 1 ? "player" : "players"}
          </p>

          <div className="space-y-3">
            {matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>

          {pageCount > 1 && (
            <Pager page={page} pageCount={pageCount} onChange={goTo} />
          )}
        </>
      )}

      {myTopFive.length === 0 && !loading && (
        <div className="mt-6 notch-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
          You haven't picked a Top 5 yet, so matching has almost nothing to go
          on.{" "}
          <Link to="/me" className="font-medium underline underline-offset-2">
            Pick one
          </Link>{" "}
          and these results will get much better.
        </div>
      )}
    </div>
  );
}

/**
 * Previous / Next, with a few page numbers between.
 *
 * Numbers rather than "load more", because the list is ranked: page 3
 * means something ("players 61–90 by match"), and you can come back to
 * it. Shows the first, the last, and two either side of where you are.
 */
function Pager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  const shown = new Set<number>([0, pageCount - 1]);
  for (let p = page - 2; p <= page + 2; p++) {
    if (p >= 0 && p < pageCount) shown.add(p);
  }
  const numbers = [...shown].sort((a, b) => a - b);

  const base =
    "notch-sm min-w-9 px-2.5 py-1.5 text-sm transition disabled:pointer-events-none disabled:opacity-30";

  return (
    <nav
      className="mt-6 flex flex-wrap items-center justify-center gap-1.5"
      aria-label="Pages"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        className={`${base} border border-line text-muted hover:text-ink`}
      >
        Previous
      </button>

      {numbers.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {/* A gap in the run gets an ellipsis, so 1 … 7 8 9 … 20 reads
              as skipping rather than as missing pages. */}
          {i > 0 && p - numbers[i - 1] > 1 && (
            <span className="px-1 text-sm text-muted" aria-hidden="true">
              …
            </span>
          )}
          <button
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={
              `${base} numeric ` +
              (p === page
                ? "bg-accent font-bold text-onaccent"
                : "border border-line text-muted hover:text-ink")
            }
          >
            {p + 1}
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount - 1}
        className={`${base} border border-line text-muted hover:text-ink`}
      >
        Next
      </button>
    </nav>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="notch border border-dashed border-line p-12 text-center">
      <h2 className="mb-2 font-semibold">
        {hasFilters ? "Nobody matches those filters" : "Nobody here yet"}
      </h2>
      <p className="mx-auto max-w-sm text-sm text-muted">
        {hasFilters
          ? "Try widening them — platform and region cut the pool down fast."
          : "You're the only player so far. This is the hard part of any app built on people: it needs people."}
      </p>
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        "notch-md border bg-surface-2 px-3 py-2 text-sm outline-none transition focus:border-accent " +
        (value ? "border-accent text-accent" : "border-line text-muted")
      }
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
