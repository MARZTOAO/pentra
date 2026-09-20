import { useCallback, useEffect, useState } from "react";
import {
  getReferralPanel,
  referralLink,
  rollReferralCode,
  type ReferralSummary,
} from "../lib/referrals";

/**
 * Your invite link, and what it has brought in.
 *
 * Two numbers rather than one, because they mean different things and
 * only one of them counts: people who used the link, and people who
 * used it and then actually started playing. Showing only the first
 * would be flattering and useless.
 */
export function ReferralPanel() {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // One call: it creates the code if there isn't one and reports on
    // it in the same trip. It used to be two awaits back to back,
    // which is two round trips to draw one panel.
    setSummary(await getReferralPanel());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The "Copied" label goes back to normal on its own.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (!summary?.code) return;

    try {
      await navigator.clipboard.writeText(referralLink(summary.code));
      setCopied(true);
      setError(null);
    } catch {
      // Clipboard access is refused often enough to be worth handling:
      // an insecure origin, a locked-down browser, an old webview.
      setError("Couldn't copy — select the link and copy it by hand.");
    }
  }

  async function roll() {
    if (busy) return;

    setBusy(true);
    setError(null);

    const { error: problem } = await rollReferralCode();

    setBusy(false);

    if (problem) {
      setError(problem.message);
      return;
    }

    setCopied(false);
    load();
  }

  if (loading) {
    return (
      <section className="mb-4 notch border border-line bg-surface/85 p-4 backdrop-blur-sm sm:p-5">
        <h2 className="mb-3 label-wide text-muted">Invite players</h2>
        <p className="text-sm text-muted">Loading…</p>
      </section>
    );
  }

  const link = summary?.code ? referralLink(summary.code) : null;

  return (
    <section className="mb-4 notch border border-line bg-surface/85 p-4 backdrop-blur-sm sm:p-5">
      <h2 className="mb-3 label-wide text-muted">Invite players</h2>

      <p className="mb-3 text-sm text-muted">
        Share this link. It counts once somebody who used it has
        actually played a session — not just signed up.
      </p>

      {link && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <code className="numeric min-w-0 flex-1 truncate notch-md border border-line bg-surface-2 px-3 py-2 text-xs">
            {link}
          </code>

          <button
            type="button"
            onClick={copy}
            className="label-wide shrink-0 notch-sm bg-accent px-4 py-2 text-onaccent transition hover:bg-accent-hi"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      <dl className="mb-3 grid grid-cols-2 gap-3">
        <div className="notch-md border border-line bg-surface-2 px-3 py-2.5">
          <dd className="numeric text-xl font-bold leading-tight">
            {summary?.qualified ?? 0}
          </dd>
          <dt className="mt-0.5 text-[11px] leading-tight text-muted">
            Playing
          </dt>
        </div>

        <div className="notch-md border border-line bg-surface-2 px-3 py-2.5">
          <dd className="numeric text-xl font-bold leading-tight">
            {summary?.total ?? 0}
          </dd>
          <dt className="mt-0.5 text-[11px] leading-tight text-muted">
            Signed up
          </dt>
        </div>
      </dl>

      <button
        type="button"
        onClick={roll}
        disabled={busy || !summary?.can_roll}
        title={
          summary?.can_roll
            ? "Issue a new code and stop the old link working"
            : "You can change your code once an hour"
        }
        className="label-wide text-muted transition hover:text-accent disabled:opacity-40 disabled:hover:text-muted"
      >
        {busy ? "…" : "New link"}
      </button>

      {/* Said out loud rather than left in a title attribute. A
          tooltip does not exist on a touch screen, so a disabled
          button with the reason hidden in one is just a dead button. */}
      <p className="mt-1.5 text-[11px] text-muted">
        {summary?.can_roll
          ? "A new link stops the old one working. Anyone who already joined still counts."
          : "You've changed it recently — you can change it again in an hour."}
      </p>
    </section>
  );
}
