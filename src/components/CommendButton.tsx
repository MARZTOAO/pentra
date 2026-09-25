import { useEffect, useState } from "react";
import {
  commendableIn,
  commendPlayer,
  commendStatus,
  COMMEND_COOLDOWN_DAYS,
} from "../lib/ratings";

/**
 * Commend from a profile — no shared session needed.
 *
 * One per player per 30 days, shared with the session card's thumbs-up
 * (supabase/73_commend_from_profile.sql). The database decides whether
 * the button is live; this only shows the answer, and when a used-up
 * commendation comes back.
 *
 * Hidden entirely when the database says you can never commend this
 * player (blocked either way, banned, or your own profile) — a
 * permanently greyed-out button would just invite the question why.
 */
export function CommendButton({
  targetId,
  name,
  onCommended,
}: {
  targetId: string;
  name: string;
  onCommended?: () => void;
}) {
  const [can, setCan] = useState<boolean | null>(null);
  const [availableAt, setAvailableAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justGiven, setJustGiven] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setJustGiven(false);
    commendStatus(targetId).then((s) => {
      if (!active) return;
      setCan(s?.can_commend ?? false);
      setAvailableAt(s?.available_at ?? null);
    });
    return () => {
      active = false;
    };
  }, [targetId]);

  async function give() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const { result, error: problem } = await commendPlayer(targetId);

    setBusy(false);

    if (problem) {
      setError(problem);
      return;
    }

    if (result === "commended") {
      setJustGiven(true);
      onCommended?.();
    }

    // 'commended' or 'already': either way it's now used up.
    setCan(false);
    setAvailableAt(
      (current) =>
        current ??
        new Date(Date.now() + COMMEND_COOLDOWN_DAYS * 86_400_000).toISOString(),
    );
  }

  // Still loading, or not something you can ever do for this player.
  if (can === null) return null;
  const onCooldown = !can && availableAt !== null;
  if (!can && !onCooldown) return null;

  const again = commendableIn(availableAt);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={give}
        disabled={!can || busy}
        title={
          can
            ? `Commend ${name}. You can do this once a month.`
            : `You've commended ${name}` + (again ? ` — again ${again}` : "")
        }
        className={
          "flex items-center gap-1.5 notch-md border px-4 py-2 text-sm font-semibold transition disabled:pointer-events-none " +
          (can
            ? "border-line text-muted hover:border-accent hover:text-accent"
            : "border-ok/50 bg-ok/10 text-ok")
        }
      >
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill={can ? "none" : "currentColor"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM7 11l4-8a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.4l-1.4 6A2 2 0 0 1 16.6 20H7" />
        </svg>
        {busy ? "Sending…" : can ? "Commend" : "Commended"}
      </button>

      {justGiven && <span className="text-xs text-ok">Thanks for vouching.</span>}
      {!can && !justGiven && again && (
        <span className="text-xs text-muted">Again {again}</span>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
