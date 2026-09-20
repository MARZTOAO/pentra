import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../lib/AuthContext";
import {
  getChangelog,
  kindLabel,
  markChangelogSeen,
  shippedAgo,
  type ChangeKind,
  type ChangelogEntry,
} from "../lib/changelog";

/**
 * What changed since you were last shown this.
 *
 * Note "last shown", not "last signed in". The marker moves when the
 * dialog is dismissed, which is the behaviour somebody actually
 * wants: leave the app open for a fortnight and you still get told
 * once about each thing, rather than getting the same dialog on every
 * reload because your sign-in was a fortnight ago.
 *
 * Whether there is anything to say is decided entirely in the
 * database, so this component's only job is to draw it.
 */
export function ChangelogDialog() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    let active = true;

    getChangelog().then((rows) => {
      if (!active || rows.length === 0) return;
      setEntries(rows);
      setOpen(true);
    });

    return () => {
      active = false;
    };
  }, [user]);

  // Hide it straight away and tell the server afterwards. If that call
  // fails they see it once more next time, which is a much better
  // failure than a dialog sitting there while the network sulks.
  function close() {
    setOpen(false);
    markChangelogSeen();
  }

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open || entries.length === 0) return null;

  const overflow = entries[0]?.overflow ?? 0;
  const total = entries.length + overflow;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 p-4 pt-10 sm:p-6 sm:pt-16"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="What's new"
    >
      {/* Shadow on the wrapper — clip-path drops one set on the panel. */}
      <div className="float-shadow flex max-h-full w-full max-w-lg flex-col">
        <div
          className="flex max-h-full w-full flex-col overflow-hidden notch border border-line bg-surface"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-line p-5">
            <h2 className="display mb-1 text-2xl">While you were gone</h2>
            <p className="text-sm text-muted">
              {total === 1
                ? "One thing changed since you were last here."
                : `${total} things changed since you were last here.`}
            </p>
          </div>

          {/* The list scrolls, not the dialog: the button underneath
              has to stay reachable with twenty entries on a phone. */}
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {entries.map((entry) => (
              <li key={entry.id} className="px-5 py-3.5">
                <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <Tag kind={entry.kind} />
                  <h3 className="text-sm font-semibold">{entry.title}</h3>
                  <span className="numeric ml-auto text-[11px] text-muted">
                    {shippedAgo(entry.shipped_at)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted">
                  {entry.body}
                </p>
              </li>
            ))}
          </ul>

          <div className="border-t border-line p-4">
            {overflow > 0 && (
              <p className="mb-2 text-[11px] text-muted">
                And {overflow} smaller {overflow === 1 ? "change" : "changes"}{" "}
                not listed.
              </p>
            )}

            <button
              type="button"
              onClick={close}
              className="label-wide w-full notch-sm bg-accent px-4 py-2.5 text-onaccent transition hover:bg-accent-hi"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Tag({ kind }: { kind: ChangeKind }) {
  // Three states, so they wear the status colours the app already uses
  // rather than three arbitrary hues.
  const tone =
    kind === "feature"
      ? "bg-accent/15 text-accent"
      : kind === "improvement"
        ? "bg-ok/15 text-ok"
        : "bg-surface-2 text-muted";

  return (
    <span
      className={`label-wide shrink-0 rounded-full px-2 py-0.5 text-[10px] ${tone}`}
    >
      {kindLabel(kind)}
    </span>
  );
}
