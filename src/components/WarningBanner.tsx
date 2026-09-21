import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { acknowledgeWarning, myWarning, type Warning } from "../lib/warning";

/**
 * "You've been warned."
 *
 * Shown to the person it's about, once, blocking, until they press
 * the button. Not a notification — a warning sitting in the bell
 * between two likes is one nobody reads, and the entire reason to
 * warn rather than ban is to give someone a real chance to stop.
 *
 * It says what happens next in plain words, because a warning that
 * doesn't name the consequence isn't a warning, it's a complaint.
 *
 * Acknowledgement is recorded server-side, which also answers "did
 * they actually see it" the next time they're reported.
 */
export function WarningBanner() {
  const [warning, setWarning] = useState<Warning | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    myWarning().then(setWarning);
  }, []);

  if (!warning) return null;

  async function dismiss() {
    if (!warning || busy) return;
    setBusy(true);
    await acknowledgeWarning(warning.id);
    setWarning(null);
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md notch border border-danger/50 bg-surface p-5 sm:p-6">
        <h2 className="mb-3 label-wide text-danger">A warning about your account</h2>

        {warning.note && (
          <p className="mb-4 whitespace-pre-line break-words notch-md border border-line bg-surface-2 p-3 text-sm leading-relaxed">
            {warning.note}
          </p>
        )}

        {/* The consequence, stated. Without it this is just somebody
            being annoyed at you. */}
        <p className="mb-5 text-sm leading-relaxed text-muted">
          If this continues, or isn't corrected, your account will be
          banned. You'll lose your profile, your friends and everything
          you've posted.
        </p>

        <button
          type="button"
          onClick={dismiss}
          disabled={busy}
          className="w-full notch-md bg-danger px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "…" : "I understand"}
        </button>

        <p className="mt-3 text-center text-[11px] text-muted">
          {new Date(warning.created_at).toLocaleDateString()}
        </p>
      </div>
    </div>,
    document.body,
  );
}
