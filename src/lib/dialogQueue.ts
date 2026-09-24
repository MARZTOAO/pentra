import { useEffect, useSyncExternalStore } from "react";

/**
 * One pop-up at a time.
 *
 * Several things want to greet you when the app opens — the first-run
 * welcome, the date-of-birth question, a birthday or anniversary, and
 * What's New. Each decides for itself, over the network, whether it
 * has anything to say, and they answer in whatever order the network
 * feels like. Left alone they'd stack on top of each other.
 *
 * So each one takes a place in line (`order`, lowest first) and reports
 * where it's got to:
 *
 *   "pending"  still asking the server — everyone behind waits
 *   "wants"    has something to show
 *   "done"     nothing to show, or shown and closed
 *
 * A dialog gets its turn when it wants one and everything ahead of it
 * is done. Waiting on "pending" as well as "wants" is the point: a
 * slow answer from the welcome must not let What's New jump ahead and
 * then get covered up a second later.
 *
 * The places in line:
 *   1 Welcome            first run only
 *   2 Date of birth      accounts from before it was asked, once
 *   3 Celebration        birthday / anniversary, on the day
 *   4 What's New
 */

export type DialogState = "pending" | "wants" | "done";

export const DIALOG_ORDER = {
  welcome: 1,
  birthDate: 2,
  celebration: 3,
  changelog: 4,
} as const;

type Entry = { order: number; state: DialogState };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getVersion() {
  return version;
}

/** Whether this dialog may draw itself right now. */
export function useDialogTurn(
  id: string,
  order: number,
  state: DialogState,
): boolean {
  // Registered during render as well as in the effect, so the very
  // first render of every dialog already counts as "pending" for the
  // ones behind it — effects run after the whole tree has rendered.
  if (!entries.has(id)) entries.set(id, { order, state });

  useEffect(() => {
    entries.set(id, { order, state });
    emit();
  }, [id, order, state]);

  // Leaving the screen counts as done, so an unmounted dialog can't
  // hold the line forever.
  useEffect(
    () => () => {
      entries.delete(id);
      emit();
    },
    [id],
  );

  useSyncExternalStore(subscribe, getVersion);

  if (state !== "wants") return false;

  for (const [otherId, other] of entries) {
    if (otherId !== id && other.order < order && other.state !== "done") {
      return false;
    }
  }
  return true;
}
