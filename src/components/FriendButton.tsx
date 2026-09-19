import { useEffect, useState } from "react";
import {
  getFriendStatus,
  sendFriendRequest,
  removeFriend,
  type FriendStatus,
} from "../lib/friends";

/**
 * The Add Friend button on someone's profile.
 *
 * It has four states rather than two, because "add friend" means
 * something different depending on where you already stand with
 * that person — and a button that lies about what it'll do is worse
 * than no button.
 */
export function FriendButton({
  targetId,
  onChange,
}: {
  targetId: string;
  onChange?: () => void;
}) {
  const [status, setStatus] = useState<FriendStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getFriendStatus(targetId).then((s) => {
      if (active) setStatus(s);
    });
    return () => {
      active = false;
    };
  }, [targetId]);

  async function act(fn: () => Promise<{ error: unknown }>) {
    setBusy(true);
    setError(null);

    const { error } = await fn();

    if (error) {
      setError((error as { message?: string }).message ?? "Something went wrong");
    } else {
      setStatus(await getFriendStatus(targetId));
      onChange?.();
    }

    setBusy(false);
  }

  if (status === null) {
    return (
      <button
        disabled
        className="notch-md border border-line px-4 py-2 text-sm font-semibold text-muted opacity-50"
      >
        …
      </button>
    );
  }

  const base =
    "notch-md px-4 py-2 text-sm font-semibold transition disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1">
      {status === "none" && (
        <button
          disabled={busy}
          onClick={() => act(() => sendFriendRequest(targetId))}
          className={`${base} bg-accent text-onaccent hover:bg-accent-hi`}
        >
          {busy ? "Sending…" : "Add friend"}
        </button>
      )}

      {/* They asked first. Adding them back is just accepting. */}
      {status === "incoming" && (
        <button
          disabled={busy}
          onClick={() => act(() => sendFriendRequest(targetId))}
          className={`${base} bg-ok text-black hover:opacity-90`}
        >
          {busy ? "Accepting…" : "Accept request"}
        </button>
      )}

      {status === "outgoing" && (
        <button
          disabled={busy}
          onClick={() => act(() => removeFriend(targetId))}
          className={`${base} border border-line text-muted hover:border-muted hover:text-ink`}
        >
          {busy ? "Cancelling…" : "Cancel request"}
        </button>
      )}

      {status === "friend" && (
        <button
          disabled={busy}
          onClick={() => act(() => removeFriend(targetId))}
          className={`${base} border border-ok/50 text-ok hover:border-danger hover:text-danger`}
        >
          {busy ? "Removing…" : "Friends"}
        </button>
      )}

      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
