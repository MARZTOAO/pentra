import { useEffect, useRef, useState } from "react";
import { Anchored } from "./Anchored";
import { StatusDot } from "./StatusDot";
import {
  PRESENCE_OPTIONS,
  choiceLabel,
  choiceState,
  getMyPresence,
  setPresence,
  type PresenceChoice,
} from "../lib/presence";

/**
 * The status dropdown that sits beside your name.
 *
 * Small on purpose — a dot, a word, a chevron. It's a control you use
 * occasionally and read constantly, so it has to be legible at a glance
 * without taking up room a profile page would rather spend on content.
 *
 * Portalled through Anchored, like every other dropdown here: the panel
 * it opens from is notched, and clip-path clips fixed descendants.
 */
export function PresencePicker({ className = "" }: { className?: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [choice, setChoice] = useState<PresenceChoice>("online");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getMyPresence().then(setChoice);
  }, []);

  async function pick(next: PresenceChoice) {
    setOpen(false);
    if (next === choice) return;

    const previous = choice;
    setChoice(next); // Optimistic — the dropdown should feel instant.
    setBusy(true);
    setFailed(false);

    const { error } = await setPresence(next);
    setBusy(false);

    // Rolling back matters more here than in most places. Someone who
    // picks Invisible and is quietly left visible has been told a
    // comfortable lie about who can see them.
    if (error) {
      setChoice(previous);
      setFailed(true);
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change how you appear to other players"
        className={
          "flex items-center gap-1.5 notch-sm border px-2 py-1 text-xs font-medium transition disabled:opacity-50 " +
          (open
            ? "border-accent text-accent"
            : "border-line text-muted hover:border-accent hover:text-ink") +
          (className ? ` ${className}` : "")
        }
      >
        <StatusDot state={choiceState(choice)} size={8} />
        {choiceLabel(choice)}
        <svg
          className={"h-3 w-3 transition " + (open ? "rotate-180" : "")}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {failed && (
        <span className="text-xs text-danger" role="alert">
          Couldn't change your status.
        </span>
      )}

      {open && (
        <Anchored anchorRef={trigger} onClose={() => setOpen(false)} width={232}>
          <div className="float-shadow">
            <ul
              role="listbox"
              className="notch-md overflow-hidden border border-line bg-surface py-1"
            >
              {PRESENCE_OPTIONS.map((option) => {
                const active = option.key === choice;
                return (
                  <li key={option.key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => pick(option.key)}
                      className={
                        "flex w-full items-start gap-2.5 px-3 py-2 text-left transition " +
                        (active
                          ? "bg-accent-dim text-accent"
                          : "text-ink hover:bg-surface-2")
                      }
                    >
                      <StatusDot
                        state={choiceState(option.key)}
                        size={9}
                        className="mt-1"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold">
                          {option.label}
                        </span>
                        <span className="block text-[11px] leading-snug text-muted">
                          {option.hint}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </Anchored>
      )}
    </>
  );
}
