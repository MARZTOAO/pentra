import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  blockUser,
  fileReport,
  REPORT_REASONS,
} from "../lib/safety";
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

  useEffect(() => {
    if (!open) return;

    function onClick(e: MouseEvent) {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

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
          className="rounded-lg border border-line px-2.5 py-2 text-muted transition hover:border-muted hover:text-ink"
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

        {open && (
          <div className="absolute right-0 top-full z-40 mt-2 w-44 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
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
          <h2 className="mb-2 text-lg font-semibold">Report sent</h2>
          <p className="mb-5 text-sm text-muted">
            Thanks — it'll be reviewed. If you'd rather not see this person
            again, you can block them from their profile.
          </p>
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-onaccent"
          >
            Done
          </button>
        </>
      ) : (
        <>
          <h2 className="mb-1 text-lg font-semibold">
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
                  "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition " +
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
            className="mb-4 w-full resize-none rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
          />

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-muted transition hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-50"
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
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <p className="mb-5 text-sm text-muted">{body}</p>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-muted transition hover:text-ink"
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
          className="flex-1 rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
