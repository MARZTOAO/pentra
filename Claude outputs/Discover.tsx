import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  findPlayers,
  touchLastSeen,
  matchReason,
  lastSeenLabel,
  type Match,
} from "../lib/matching";
import { getTopFive, type TopFiveEntry } from "../lib/topFive";
import { useAuth } from "../lib/AuthContext";
import { PLATFORMS, REGIONS, formatLocation } from "../lib/constants";
import { Alert, FullScreenLoader } from "../components/ui";

export default function Discover() {
  const { user } = useAuth();

  const [matches, setMatches] = useState<Match[]>([]);
  const [myTopFive, setMyTopFive] = useState<TopFiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [gameId, setGameId] = useState<number | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);

  // Load my Top 5 once, to populate the game filter.
  useEffect(() => {
    if (!user) return;
    getTopFive(user.id).then(setMyTopFive);
    touchLastSeen();
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await findPlayers({ gameId, platform, region });

    if (error) setError(error.message);
    else setMatches((data ?? []) as Match[]);

    setLoading(false);
  }, [gameId, platform, region]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Find players</h1>
        <p className="mt-1 text-sm text-muted">
          Ranked by how much you have in common. Every result says why.
        </p>
      </header>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Select
          value={gameId === null ? "" : String(gameId)}
          onChange={(v) => setGameId(v ? Number(v) : null)}
          placeholder="Any of my games"
          options={myTopFive.map((e) => ({
            value: String(e.game.id),
            label: e.game.name,
          }))}
        />
        <Select
          value={platform ?? ""}
          onChange={(v) => setPlatform(v || null)}
          placeholder="Any platform"
          options={PLATFORMS.map((p) => ({ value: p, label: p }))}
        />
        <Select
          value={region ?? ""}
          onChange={(v) => setRegion(v || null)}
          placeholder="Any region"
          options={REGIONS.map((r) => ({ value: r, label: r }))}
        />

        {(gameId || platform || region) && (
          <button
            onClick={() => {
              setGameId(null);
              setPlatform(null);
              setRegion(null);
            }}
            className="rounded-lg px-3 py-2 text-sm text-muted transition hover:text-ink"
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
        <div className="space-y-3">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}

      {myTopFive.length === 0 && !loading && (
        <div className="mt-6 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
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

function MatchCard({ match }: { match: Match }) {
  const seen = lastSeenLabel(match.last_seen_at);
  const place = formatLocation(match);

  return (
    <Link
      to={`/u/${match.username}`}
      className="flex gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-accent/50 hover:bg-surface-2"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-line bg-surface-2">
        {match.avatar_url ? (
          <img src={match.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl font-bold text-muted">
            {match.username.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2">
          <p className="truncate font-semibold">
            {match.display_name || match.username}
          </p>
          <p className="truncate text-xs text-muted">@{match.username}</p>
          {seen === "online now" && (
            <span className="flex items-center gap-1 text-xs text-ok">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              online
            </span>
          )}
        </div>

        {/* The reason. This is the most important text on the card. */}
        <p className="mb-2 text-sm text-accent">{matchReason(match)}</p>

        {match.bio && (
          <p className="mb-2 line-clamp-1 text-sm text-muted">{match.bio}</p>
        )}

        <p className="text-xs text-muted">
          {[place, match.region, seen !== "online now" ? seen : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-center">
        <span className="text-lg font-bold text-accent">
          {Math.round(match.score)}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-muted">
          match
        </span>
      </div>
    </Link>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-12 text-center">
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
        "rounded-lg border bg-surface-2 px-3 py-2 text-sm outline-none transition focus:border-accent " +
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
