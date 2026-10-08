import { useState } from "react";
import { levelProgress, usePlayerLevel, xpHowTo } from "../lib/level";

/**
 * "Lv 12 · Veteran" on a profile (supabase/113), with a thin XP bar.
 * Tap it for the numbers and how XP is earned. Draws nothing until the
 * level has loaded, so the header doesn't jump.
 */
export function LevelBadge({ userId, isSelf, className = "" }: { userId: string; isSelf: boolean; className?: string }) {
  const lvl = usePlayerLevel(userId);
  const [open, setOpen] = useState(false);
  if (!lvl) return null;

  const pct = Math.round(levelProgress(lvl) * 100);
  const toNext = Math.max(0, lvl.next_floor - lvl.xp);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={`${lvl.xp.toLocaleString()} XP · ${toNext.toLocaleString()} to level ${lvl.level + 1}`}
        className="notch-sm inline-flex items-center gap-2 border border-accent/50 bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent transition hover:bg-accent/15"
      >
        <span>
          Lv <span className="numeric">{lvl.level}</span>
        </span>
        <span className="text-ink/80">{lvl.title}</span>
        <span className="relative h-1.5 w-14 overflow-hidden bg-bg/80" aria-hidden="true">
          <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pct}%` }} />
        </span>
      </button>

      {open && (
        <div className="mt-2 max-w-md notch-sm border border-line bg-surface/90 p-3 text-xs text-muted backdrop-blur-sm">
          <p className="text-ink">
            <span className="numeric font-semibold">{lvl.xp.toLocaleString()}</span> XP ·{" "}
            <span className="numeric">{toNext.toLocaleString()}</span> more for level {lvl.level + 1}.
          </p>
          <p className="mt-1 leading-relaxed">
            {isSelf ? "You earn XP by being active on Pentra. " : "XP comes from being active on Pentra. "}
            {xpHowTo(lvl.rules)}
          </p>
          <p className="mt-1">Rookie 1 · Regular 5 · Veteran 10 · Elite 20 · Legend 30 · Mythic 50.</p>
        </div>
      )}
    </div>
  );
}
