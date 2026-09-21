import { useEffect, useState } from "react";
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
 * The release notes aren't shown: builds are automatic and their
 * notes say so. What actually changed is in What's New, which the
 * app already shows after an update.
 *
 * Errors from the automatic check are NOT shown here. A failed
 * background check at 3am is not the person's problem. They're
 * visible in Settings, where somebody pressing "check now" wants to
 * know why nothing happened.
 */
export function UpdateBanner() {
  const s = useUpdateState();

  useEffect(() => {
    startUpdateChecks();
  }, []);

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
              <p className="mt-1 text-xs text-muted">
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
