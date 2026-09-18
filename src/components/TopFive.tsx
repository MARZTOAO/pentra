import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import {
  getTopFive,
  saveTopFive,
  type Game,
  type TopFiveEntry,
} from "../lib/topFive";
import { GameSearchModal } from "./GameSearchModal";
import { Button, Alert } from "./ui";

export function TopFive() {
  const { user } = useAuth();

  const [entries, setEntries] = useState<TopFiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!user) return;
    getTopFive(user.id).then((rows) => {
      setEntries(rows);
      setLoading(false);
    });
  }, [user]);

  function addGame(game: Game) {
    setEntries((current) => [
      ...current,
      {
        game,
        rank: current.length + 1,
        // Pre-select the platform when there's only one sensible answer.
        platform: game.platforms.length === 1 ? game.platforms[0] : null,
        note: null,
      },
    ]);
    setPicking(false);
  }

  function remove(index: number) {
    setEntries((current) => current.filter((_, i) => i !== index));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= entries.length) return;

    setEntries((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function patch(index: number, changes: Partial<TopFiveEntry>) {
    setEntries((current) =>
      current.map((entry, i) => (i === index ? { ...entry, ...changes } : entry)),
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error } = await saveTopFive(entries);

    setSaving(false);

    if (error) setError(error.message);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  if (loading) {
    return (
      <section className="mb-8 rounded-xl border border-line bg-surface p-5">
        <p className="text-sm text-muted">Loading your Top 5…</p>
      </section>
    );
  }

  const emptySlots = 5 - entries.length;

  return (
    <section className="mb-8 rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
        Your Top 5
      </h2>
      <p className="mb-5 text-xs text-muted">
        The heart of your profile, and what everyone gets matched on. Order
        matters — a shared number one counts for far more than a shared number
        five.
      </p>

      {error && <Alert>{error}</Alert>}
      {saved && <Alert kind="ok">Top 5 saved.</Alert>}

      <div className="mb-4 space-y-3">
        {entries.map((entry, index) => (
          <div
            key={entry.game.id}
            className="flex gap-3 rounded-lg border border-line bg-surface-2 p-3"
          >
            {/* Rank + cover */}
            <div className="relative shrink-0">
              <div className="h-24 w-16 overflow-hidden rounded bg-bg">
                {entry.game.cover_url && (
                  <img
                    src={entry.game.cover_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <span className="absolute -left-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white shadow">
                {index + 1}
              </span>
            </div>

            {/* Details */}
            <div className="min-w-0 flex-1">
              <p className="mb-2 truncate text-sm font-semibold">
                {entry.game.name}
              </p>

              <div className="mb-2 flex gap-2">
                <select
                  value={entry.platform ?? ""}
                  onChange={(e) =>
                    patch(index, { platform: e.target.value || null })
                  }
                  className="rounded border border-line bg-bg px-2 py-1 text-xs outline-none focus:border-accent"
                >
                  <option value="">Platform…</option>
                  {entry.game.platforms.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <input
                value={entry.note ?? ""}
                onChange={(e) => patch(index, { note: e.target.value })}
                maxLength={100}
                placeholder="Optional — what should people know?"
                className="w-full rounded border border-line bg-bg px-2 py-1.5 text-xs outline-none focus:border-accent"
              />
            </div>

            {/* Controls */}
            <div className="flex shrink-0 flex-col justify-center gap-1">
              <IconButton
                label="Move up"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                d="M12 19V5M5 12l7-7 7 7"
              />
              <IconButton
                label="Move down"
                disabled={index === entries.length - 1}
                onClick={() => move(index, 1)}
                d="M12 5v14M19 12l-7 7-7-7"
              />
              <IconButton
                label="Remove"
                onClick={() => remove(index)}
                d="M18 6 6 18M6 6l12 12"
                danger
              />
            </div>
          </div>
        ))}

        {/* Empty slots */}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <button
            key={`empty-${i}`}
            onClick={() => setPicking(true)}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-line p-3 text-left transition hover:border-accent hover:bg-surface-2"
          >
            <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded border border-dashed border-line text-2xl text-muted">
              +
            </div>
            <div>
              <p className="text-sm font-medium text-muted">
                Slot {entries.length + i + 1}
              </p>
              <p className="text-xs text-muted">Add a game</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="w-40">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Top 5"}
          </Button>
        </div>
        <p className="text-xs text-muted">
          {entries.length}/5 filled
          {entries.length < 3 && " — three or more makes matching much better."}
        </p>
      </div>

      {picking && (
        <GameSearchModal
          onPick={addGame}
          onClose={() => setPicking(false)}
          excludeIds={entries.map((e) => e.game.id)}
        />
      )}
    </section>
  );
}

function IconButton({
  label,
  d,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  d: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={
        "rounded border border-line p-1.5 transition disabled:opacity-25 " +
        (danger
          ? "text-muted hover:border-danger hover:text-danger"
          : "text-muted hover:border-muted hover:text-ink")
      }
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={d} />
      </svg>
    </button>
  );
}
