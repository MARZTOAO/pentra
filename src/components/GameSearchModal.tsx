import { useEffect, useRef, useState } from "react";
import { searchGames, releaseLabel, type Game } from "../lib/topFive";

export function GameSearchModal({
  onPick,
  onClose,
  excludeIds,
}: {
  onPick: (game: Game) => void;
  onClose: () => void;
  excludeIds: number[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Game[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Wait until typing pauses before searching, so a five-letter word
  // doesn't fire five separate queries.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await searchGames(query);
      setResults(found.filter((g) => !excludeIds.includes(g.id)));
      setSearching(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, excludeIds]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-6 pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line p-4">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a game…"
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <div className="max-h-96 overflow-y-auto">
          {query.trim().length < 2 && (
            <p className="p-6 text-center text-sm text-muted">
              Type at least two letters.
            </p>
          )}

          {query.trim().length >= 2 && searching && (
            <p className="p-6 text-center text-sm text-muted">Searching…</p>
          )}

          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <p className="p-6 text-center text-sm text-muted">
              Nothing found. The catalogue holds the 5,000 most-rated games —
              very new or very obscure titles may be missing.
            </p>
          )}

          {results.map((game) => (
            <button
              key={game.id}
              onClick={() => onPick(game)}
              className="flex w-full items-center gap-3 border-b border-line/60 px-4 py-3 text-left transition last:border-0 hover:bg-surface-2"
            >
              <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-surface-2">
                {game.cover_url && (
                  <img
                    src={game.cover_url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{game.name}</p>
                <p className="truncate text-xs text-muted">
                  {game.genres.slice(0, 3).join(" · ") || "—"}
                </p>
              </div>

              {/* Without this an unreleased game looks like a broken
                  catalogue entry — no ratings, no posts, no reason to
                  be there. The date explains it. */}
              {releaseLabel(game) && (
                <span className="shrink-0 rounded-full border border-accent/50 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                  {releaseLabel(game)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
