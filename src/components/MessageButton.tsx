import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { openConversation } from "../lib/chat";

/**
 * Opens the thread with someone, creating it on first use.
 *
 * The conversation is made at the moment you click rather than when the
 * first message sends — simpler, and it means a half-written message
 * has somewhere to live if they navigate away and come back.
 */
export function MessageButton({ targetId }: { targetId: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);

    const { data, error } = await openConversation(targetId);

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    navigate(`/messages/${data}`);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={open}
        disabled={busy}
        className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {busy ? "Opening…" : "Message"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
