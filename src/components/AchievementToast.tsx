import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../lib/AuthContext";
import {
  checkMyAchievements,
  getAchievementDetails,
  subscribeToUnlocks,
} from "../lib/achievements";
import { play } from "../lib/sound";

/**
 * "Achievement unlocked", along the bottom of the screen.
 *
 * THE THING THIS HAS TO GET RIGHT is that achievements arrive in
 * clumps. Making your first post can trip Hello World; joining your
 * first session can trip Showed Up and Regulars at once; and anybody
 * who has been here a while earned a dozen retroactively the moment
 * the feature shipped. Showing each one for three seconds in turn
 * would be a forty-five second parade nobody asked for.
 *
 * So unlocks are collected for a beat and shown as one: the first by
 * name, the rest as a count. One toast, one sound, three seconds,
 * done.
 */

/** How long to wait for stragglers before showing anything. */
const BATCH_MS = 1200;

/** How long the toast stays. */
const SHOW_MS = 3000;

type Shown = {
  title: string;
  detail: string;
  extra: number;
};

export function AchievementToast() {
  const { user } = useAuth();
  const [shown, setShown] = useState<Shown | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Codes waiting for the batch window to close.
  const pending = useRef<string[]>([]);
  const batchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;

    async function flush() {
      const codes = Array.from(new Set(pending.current));
      pending.current = [];
      batchTimer.current = null;

      if (codes.length === 0) return;

      const details = await getAchievementDetails(codes);
      if (details.length === 0) return;

      const [first, ...rest] = details;

      setLeaving(false);
      setShown({
        title: first.name ?? "Achievement",
        detail: first.description ?? "",
        extra: rest.length,
      });

      play("achievement");
    }

    const stop = subscribeToUnlocks(user.id, (codes) => {
      pending.current.push(...codes);

      // Restart the window on every arrival, so a clump that trickles
      // in over a second still lands as one toast.
      if (batchTimer.current) clearTimeout(batchTimer.current);
      batchTimer.current = setTimeout(flush, BATCH_MS);
    });

    // Subscribe first, ask second. Anything owed — an anniversary that
    // passed while they were away, a streak that ticked over — is
    // awarded now and arrives through the subscription above, so it
    // gets a toast rather than appearing silently on the profile.
    checkMyAchievements();

    return () => {
      stop();
      if (batchTimer.current) clearTimeout(batchTimer.current);
    };
  }, [user]);

  // Three seconds, then fade. The fade is separate so the element is
  // still mounted while it animates out.
  useEffect(() => {
    if (!shown) return;

    const hide = setTimeout(() => setLeaving(true), SHOW_MS);
    const drop = setTimeout(() => setShown(null), SHOW_MS + 200);

    return () => {
      clearTimeout(hide);
      clearTimeout(drop);
    };
  }, [shown]);

  if (!shown) return null;

  return createPortal(
    <div
      // Above the mobile tab bar, which is fixed to the bottom and
      // about 4.5rem tall — a toast sitting under it would be half a
      // toast. On desktop there is no bar, so it can sit lower.
      className={
        "pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-8 " +
        "transition-all duration-200 " +
        (leaving ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100")
      }
      role="status"
      aria-live="polite"
    >
      <div className="float-shadow">
        <div className="flex items-center gap-3 notch border border-accent/50 bg-surface px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6.1L12 16.8 6.7 19.7l1.1-6.1L3.4 9.4l6-.8Z" />
            </svg>
          </span>

          <div className="min-w-0">
            <p className="label-wide text-accent">Achievement unlocked</p>
            <p className="truncate text-sm font-semibold">
              {shown.title}
              {shown.extra > 0 && (
                <span className="font-normal text-muted">
                  {" "}
                  and {shown.extra} more
                </span>
              )}
            </p>
            {shown.extra === 0 && shown.detail && (
              <p className="truncate text-[11px] text-muted">{shown.detail}</p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
