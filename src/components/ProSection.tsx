import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { useFlag } from "../lib/flags";
import {
  PRICES,
  getMyBilling,
  openBillingPortal,
  renews,
  useSellsProHere,
  type MyBilling,
} from "../lib/billing";
import { ProBadge } from "./ProBadge";

/**
 * Settings → Pentra Pro. Your plan at a glance and the way to Stripe
 * for cancelling or changing a card; the full page is /pro.
 *
 * Draws nothing for a free account while Pro isn't on sale — there's
 * nothing to say and nothing to buy.
 */
export function ProSection() {
  const { user } = useAuth();
  const flag = useFlag("pro_sales");
  // In the iPhone app outside the US App Store there are no buttons to
  // Stripe at all (see canSellProHere): a member still sees their plan.
  const sellsHere = useSellsProHere() === true;
  const open = flag && sellsHere;
  const [billing, setBilling] = useState<MyBilling | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyBilling().then(setBilling);
  }, [user]);

  if (!billing) return null;
  if (!billing.pro && !open) return null;

  async function manage() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const msg = await openBillingPortal();
    setBusy(false);
    if (msg) setError(msg);
  }

  const s = billing.subscription;
  const live = renews(billing);

  let line: string;
  if (billing.permanent) line = "Yours for good — no end date, nothing to pay.";
  else if (s && live)
    line = `${PRICES[s.plan].label} plan. Renews ${s.current_period_end ? day(s.current_period_end) : "automatically"}.`;
  else if (s && billing.expires_at)
    line = `Cancelled. Pro stays on until ${day(billing.expires_at)}.`;
  else if (billing.pro && billing.expires_at) line = `Yours until ${day(billing.expires_at)}.`;
  else line = "You're on the free plan.";

  return (
    <section className="mb-8 notch border border-line bg-surface p-5">
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="label-wide text-muted">Pentra Pro</h2>
        {billing.pro && <ProBadge />}
      </div>
      <p className="mb-4 text-xs text-muted">{line}</p>

      <div className="flex flex-wrap gap-2">
        {s && sellsHere ? (
          <button
            type="button"
            onClick={manage}
            disabled={busy}
            className="notch-md border border-line px-4 py-2 text-sm font-semibold transition hover:border-muted disabled:opacity-50"
          >
            {busy ? "Opening…" : live ? "Manage or cancel" : "Manage billing"}
          </button>
        ) : (
          !billing.permanent &&
          open && (
            <Link
              to="/pro"
              className="notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi"
            >
              {billing.pro ? "Add a subscription" : "See Pentra Pro"}
            </Link>
          )
        )}
        <Link
          to="/pro"
          className="notch-md px-4 py-2 text-sm font-semibold text-muted transition hover:text-ink"
        >
          What's included
        </Link>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  );
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
