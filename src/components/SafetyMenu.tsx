import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  blockUser,
  fileReport,
  REPORT_REASONS,
} from "../lib/safety";
import { Anchored } from "./Anchored";
import { Alert } from "./ui";

/**
 * The "..." menu on someone's profile: report, or block.
 *
 * Kept out of the main row of buttons on purpose. These are rare,
 * deliberate actions — putting Block next to Add Friend invites
 * mis-taps on the one action that's unpleasant to undo.
 */
export function SafetyMenu({
  targetId,
  username,
  onBlocked,
}: {
  targetId: string;
  username: string;
  onBlocked?: () => void;
}) {
  const navigate = useNavigate();
  const menu = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  // Dismissal lives in <Anchored>, which owns it because the menu is
  // portalled out of this subtree.

  async function doBlock() {
    const { error } = await blockUser(targetId);
    if (!error) {
      onBlocked?.();
      navigate("/discover");
    }
  }

  return (
    <>
      <div className="relative" ref={menu}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="More"
          title="More"
          className="notch-md border border-line px-2.5 py-2 text-muted transition hover:border-muted hover:text-ink"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>

        {/* <Anchored> portals this out of the notched tree and carries the
            shadow, which clip-path would otherwise discard. */}
        {open && (
          <Anchored
            anchorRef={menu}
            onClose={() => setOpen(false)}
            width={176}
            align="right"
          >
            <div className="overflow-hidden notch border border-line bg-surface">
              <button
                onClick={() => {
                  setOpen(false);
                  setReporting(true);
                }}
                className="w-full px-3 py-2.5 text-left text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
              >
                Report @{username}
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  setConfirmBlock(true);
                }}
                className="w-full px-3 py-2.5 text-left text-sm text-danger transition hover:bg-danger/10"
              >
                Block @{username}
              </button>
            </div>
          </Anchored>
        )}
      </div>

      {reporting && (
        <ReportDialog
          username={username}
          userId={targetId}
          onClose={() => setReporting(false)}
        />
      )}

      {confirmBlock && (
        <Confirm
          title={`Block @${username}?`}
          body="You won't see each other anywhere in the app. If you're friends, that ends. You can undo this in Settings."
          confirmLabel="Block"
          onCancel={() => setConfirmBlock(false)}
          onConfirm={doBlock}
        />
      )}
    </>
  );
}

export function ReportDialog({
  username,
  userId,
  postId,
  onClose,
}: {
  username: string;
  userId?: string | null;
  postId?: number | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].key);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);

    const { error } = await fileReport({ userId, postId, reason, detail });

    setBusy(false);

    if (error) setError(error.message);
    else setDone(true);
  }

  return (
    <Overlay onClose={onClose}>
      {done ? (
        <>
          <h2 className="mb-2 display text-lg">Report sent</h2>
          <p className="mb-5 text-sm text-muted">
            Thanks — it'll be reviewed. If you'd rather not see this person
            again, you can block them from their profile.
          </p>
          <button
            onClick={onClose}
            className="w-full notch-md bg-accent px-4 py-2.5 text-sm font-semibold text-onaccent"
          >
            Done
          </button>
        </>
      ) : (
        <>
          <h2 className="mb-1 display text-lg">
            Report {postId ? "this post" : `@${username}`}
          </h2>
          <p className="mb-4 text-sm text-muted">
            Reports are private. The person you're reporting won't be told who
            filed it.
          </p>

          {error && <Alert>{error}</Alert>}

          <div className="mb-4 space-y-1">
            {REPORT_REASONS.map((r) => (
              <label
                key={r.key}
                className={
                  "flex cursor-pointer items-center gap-2.5 notch-md border px-3 py-2 text-sm transition " +
                  (reason === r.key
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-line text-muted hover:border-muted hover:text-ink")
                }
              >
                <input
                  type="radio"
                  name="reason"
                  checked={reason === r.key}
                  onChange={() => setReason(r.key)}
                  className="sr-only"
                />
                {r.label}
              </label>
            ))}
          </div>

          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Anything else worth knowing (optional)"
            className="mb-4 w-full resize-none notch-md border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
          />

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 notch-md border border-line px-4 py-2.5 text-sm font-medium text-muted transition hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="flex-1 notch-md bg-accent px-4 py-2.5 text-sm font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send report"}
            </button>
          </div>
        </>
      )}
    </Overlay>
  );
}

export function Confirm({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Overlay onClose={onCancel}>
      <h2 className="mb-2 display text-lg">{title}</h2>
      <p className="mb-5 text-sm text-muted">{body}</p>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 notch-md border border-line px-4 py-2.5 text-sm font-medium text-muted transition hover:text-ink"
        >
          Cancel
        </button>
        <button
          onClick={async () => {
            setBusy(true);
            await onConfirm();
            setBusy(false);
          }}
          disabled={busy}
          className="flex-1 notch-md bg-danger px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "…" : confirmLabel}
        </button>
      </div>
    </Overlay>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portalled to <body> — see PostMediaGrid for why. A notched ancestor
  // would clip this overlay to its own box.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div className="float-shadow w-full max-w-md">
      <div
        className="w-full notch border border-line bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
      </div>
    </div>,
    document.body,
  );
}
