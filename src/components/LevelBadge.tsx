import { useEffect, useRef, useState } from "react";
import { levelProgress, usePlayerLevel, xpHowTo } from "../lib/level";

/**
 * "Lv 12 · Veteran" with a thin XP bar, first chip on the profile's
 * badge rail (supabase/113). Same height as the other chips. Tap it
 * for the numbers and how XP is earned (a small popover, closed by
 * tapping anywhere else or Escape). Draws nothing until the level has
 * loaded, so the rail doesn't jump.
 */
export function LevelBadge({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const lvl = usePlayerLevel(userId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  if (!lvl) return null;

  const pct = Math.round(levelProgress(lvl) * 100);
  const toNext = Math.max(0, lvl.next_floor - lvl.xp);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={`${lvl.xp.toLocaleString()} XP · ${toNext.toLocaleString()} to level ${lvl.level + 1}`}
        className="chip border border-accent/50 bg-accent/10 text-accent transition hover:bg-accent/15"
      >
        <span className="font-semibold">
          Lv <span className="numeric">{lvl.level}</span>
        </span>
        <span className="text-ink">{lvl.title}</span>
        <span className="relative h-1 w-10 overflow-hidden bg-bg/70" aria-hidden="true">
          <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pct}%` }} />
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute left-0 top-full z-20 mt-1.5 w-72 notch-sm border border-line bg-surface p-3 text-xs text-muted shadow-xl sm:w-80"
        >
          <p className="text-ink">
            <span className="numeric font-semibold">{lvl.xp.toLocaleString()}</span> XP ·{" "}
            <span className="numeric">{toNext.toLocaleString()}</span> more for level {lvl.level + 1}.
          </p>
          <p className="mt-1.5 leading-relaxed">
            {isSelf ? "You earn XP by being active on Pentra. " : "XP comes from being active on Pentra. "}
            {xpHowTo(lvl.rules)}
          </p>
          <p className="mt-1.5">Rookie 1 · Regular 5 · Veteran 10 · Elite 20 · Legend 30 · Mythic 50.</p>
        </div>
      )}
    </div>
  );
}
