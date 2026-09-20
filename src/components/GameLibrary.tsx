import { useEffect, useState } from "react";
import {
  getLibrary,
  addToLibrary,
  removeFromLibrary,
  MAX_LIBRARY,
} from "../lib/library";
import { releaseLabel, type Game } from "../lib/topFive";
import { GameSearchModal } from "./GameSearchModal";
import { Alert } from "./ui";

/**
 * The library section, on your own profile and on other people's.
 *
 * Covers in a grid rather than a list: twenty titles as text is a wall
 * nobody reads, but twenty covers is something you scan in a second
 * and recognise. Which is the whole point — someone looking at your
 * profile is really asking "is there anything here I also have?".
 *
 * Saves on each change rather than behind a button. There's no
 * ordering to get right and nothing to review, so a save step would
 * be a thing to forget rather than a safeguard.
 */
export function GameLibrary({
  userId,
  editable,
  emptyNote,
  onChanged,
}: {
  userId: string;
  editable: boolean;
  emptyNote?: string;
  /**
   * Fired after a game is added or removed. The library feeds two
   * achievements and a stat tile that live in sibling panels, and
   * siblings cannot see each other — without this they keep showing
   * the numbers they fetched when the page opened.
   */
  onChanged?: () => void;
}) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getLibrary(userId).then((rows) => {
      if (!active) return;
      setGames(rows);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  async function add(game: Game) {
    setPicking(false);

    if (games.some((g) => g.id === game.id)) return;

    setBusy(true);
    setError(null);

    const { error } = await addToLibrary(userId, game.id);

    setBusy(false);

    if (error) {
      // The cap is enforced by the database, so its message is the
      // honest one to show.
      setError(error.message);
      return;
    }

    setGames((current) => [game, ...current]);
    onChanged?.();
  }

  async function remove(game: Game) {
    setBusy(true);
    setError(null);

    const { error } = await removeFromLibrary(userId, game.id);

    setBusy(false);

    if (error) {
      setError(error.message);
    } else {
      setGames((current) => current.filter((g) => g.id !== game.id));
      onChanged?.();
    }
  }

  if (loading) return null;

  // Nothing to show a visitor, and nothing worth an empty box.
  if (!editable && games.length === 0) return null;

  const room = MAX_LIBRARY - games.length;

  return (
    <section className="mb-8 notch border border-line bg-surface/85 p-5 backdrop-blur-sm">
      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="label-wide text-muted">
          Also plays
        </h2>
        <span className="text-xs text-muted">
          {games.length}/{MAX_LIBRARY}
        </span>
      </div>

      <p className="mb-4 text-xs text-muted">
        {editable
          ? "Games you own and play now and then. Separate from your Top 5 — this is what you'd say yes to on a Tuesday, and it's what matching uses to find someone you could actually play with tonight."
          : "Games they own and play now and then."}
      </p>

      {error && <Alert>{error}</Alert>}

      {games.length === 0 ? (
        <p className="notch border border-dashed border-line p-6 text-center text-sm text-muted">
          {emptyNote ??
            "Nothing here yet. Add a few and your matches get noticeably better."}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
          {games.map((game) => (
            <div key={game.id} className="group relative">
              <div className="aspect-[3/4] overflow-hidden notch-md border border-line bg-surface-2">
                {game.cover_url ? (
                  <img
                    src={game.cover_url}
                    alt={game.name}
                    title={game.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] leading-tight text-muted">
                    {game.name}
                  </span>
                )}
              </div>

              {releaseLabel(game) && (
                <span className="pointer-events-none absolute bottom-1 left-1 right-1 truncate rounded bg-black/75 px-1 py-0.5 text-center text-[9px] font-semibold text-white">
                  {releaseLabel(game)}
                </span>
              )}

              {editable && (
                <button
                  type="button"
                  onClick={() => remove(game)}
                  disabled={busy}
                  aria-label={`Remove ${game.name}`}
                  title={`Remove ${game.name}`}
                  className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-danger text-xs font-bold text-white shadow group-hover:flex"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          {editable && room > 0 && (
            <button
              type="button"
              onClick={() => setPicking(true)}
              disabled={busy}
              title="Add a game"
              className="flex aspect-[3/4] items-center justify-center notch-md border-2 border-dashed border-line text-2xl text-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
            >
              +
            </button>
          )}
        </div>
      )}

      {editable && games.length === 0 && (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="mt-3 notch-md border border-line px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-accent"
        >
          Add a game
        </button>
      )}

      {editable && room === 0 && (
        <p className="mt-2 text-xs text-muted">
          That's twenty — remove one to add another.
        </p>
      )}

      {picking && (
        <GameSearchModal
          // Only what's already here is excluded. Your Top 5 isn't:
          // the two lists are independent by design.
          excludeIds={games.map((g) => g.id)}
          onClose={() => setPicking(false)}
          onPick={add}
        />
      )}
    </section>
  );
}
