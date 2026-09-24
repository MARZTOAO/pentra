import { useEffect, useState } from "react";
import { getUpcomingChanges, type UpcomingChanges } from "../lib/changelog";
import {
  dismissUpdate,
  getUpdateState,
  installUpdate,
  startUpdateChecks,
  subscribe,
  type UpdateState,
} from "../lib/updater";

/** The updater's state, live. Same object everywhere it's used. */
export function useUpdateState(): UpdateState {
  const [s, setS] = useState(getUpdateState);
  useEffect(() => subscribe(setS), []);
  return s;
}

/**
 * The corner card that says a new version exists.
 *
 * Desktop only — in a browser the updater never has anything to say,
 * and this renders nothing. Sits above everything, bottom right,
 * where Steam and Discord put theirs; small enough to ignore for a
 * week, present enough that nobody stays on an old build forever.
 *
 * The GitHub release notes aren't shown: builds are automatic and
 * their notes only say so. Instead the card lists a few What's New
 * headlines this copy doesn't have yet — the same entries the app will
 * show properly once it's updated — because "Pentra 0.1.24 is ready"
 * gives nobody a reason to click, and "Everyone in Find players" does.
 *
 * Errors from the automatic check are NOT shown here. A failed
 * background check at 3am is not the person's problem. They're
 * visible in Settings, where somebody pressing "check now" wants to
 * know why nothing happened.
 */
export function UpdateBanner() {
  const s = useUpdateState();
  const [upcoming, setUpcoming] = useState<UpcomingChanges | null>(null);

  useEffect(() => {
    startUpdateChecks();
  }, []);

  // Fetched once per offered version. Failure just means no list —
  // the card works the same without it.
  const offered = s.kind === "available" ? s.version : null;
  const releasedAt = s.kind === "available" ? s.date : null;

  useEffect(() => {
    if (!offered) return;
    let active = true;
    getUpcomingChanges(releasedAt).then((u) => {
      if (active) setUpcoming(u);
    });
    return () => {
      active = false;
    };
  }, [offered, releasedAt]);

  if (s.kind !== "available" && s.kind !== "downloading" && s.kind !== "installing") {
    return null;
  }

  const busy = s.kind !== "available";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end p-4">
      <div className="float-shadow pointer-events-auto w-full max-w-sm">
        <div className="notch-md border border-accent/50 bg-surface p-4 rise">
          <p className="label-wide text-accent">Update</p>

          {s.kind === "available" && (
            <>
              <p className="mt-2 text-sm font-semibold">
                Pentra {s.version} is ready to install.
              </p>

              {upcoming && upcoming.titles.length > 0 && (
                <div className="mt-3">
                  <p className="label-wide mb-1.5 text-[10px] text-muted">
                    What's in it
                  </p>
                  <ul className="space-y-1">
                    {upcoming.titles.map((title) => (
                      <li key={title} className="flex gap-2 text-sm">
                        <span
                          className="mt-[7px] h-1.5 w-1.5 shrink-0 bg-accent"
                          aria-hidden="true"
                        />
                        <span>{title}</span>
                      </li>
                    ))}
                  </ul>
                  {upcoming.total > upcoming.titles.length && (
                    <p className="mt-1 text-xs text-muted">
                      and {upcoming.total - upcoming.titles.length} more
                    </p>
                  )}
                </div>
              )}

              <p className="mt-3 text-xs text-muted">
                The app will close and reopen. Takes about ten seconds.
              </p>
            </>
          )}

          {s.kind === "downloading" && (
            <>
              <p className="mt-2 text-sm font-semibold">
                Downloading {s.version}
                {s.percent !== null && (
                  <span className="numeric ml-2 text-muted">{s.percent}%</span>
                )}
              </p>
              <div className="mt-2 h-1 w-full overflow-hidden bg-surface-2">
                <div
                  className="h-full bg-accent transition-[width]"
                  style={{ width: `${s.percent ?? 15}%` }}
                />
              </div>
            </>
          )}

          {s.kind === "installing" && (
            <p className="mt-2 text-sm font-semibold">Installing — back in a moment.</p>
          )}

          {!busy && (
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => void installUpdate()}
                className="notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi"
              >
                Install and restart
              </button>
              <button
                onClick={dismissUpdate}
                className="px-3 py-2 text-sm font-medium text-muted transition hover:text-ink"
              >
                Later
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
