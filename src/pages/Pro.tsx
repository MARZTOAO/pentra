import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { loadFlags } from "../lib/flags";
import {
  CREATOR_DISCOUNT,
  PRICES,
  REFUND_DAYS,
  checkCreatorCode,
  forgetCreatorCode,
  getMyBilling,
  openBillingPortal,
  rememberedCreatorCode,
  renews,
  startCheckout,
  type CodeCheck,
  type MyBilling,
  type Plan,
} from "../lib/billing";
import { isDesktopApp } from "../lib/platform";
import { ProBadge } from "../components/ProBadge";
import { ON_GOLD, PRO_GOLD } from "../components/ProCard";
import { Alert, FullScreenLoader } from "../components/ui";

/**
 * Pentra Pro — the upgrade page, and where a member sees their plan.
 *
 * Nothing here takes a card. "Continue to checkout" opens Stripe's own
 * page (a new tab in the browser; the system browser from the desktop
 * app) and Stripe sends them back to /pro?done=1, by which time the
 * webhook has usually already switched Pro on. The page polls until
 * it has.
 *
 * Open to buy only while the `pro_sales` flag is on for you — testers
 * during Stripe's test mode, everyone from launch. The Edge Function
 * checks the same flag; this page just says so politely.
 */
export default function Pro() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const done = params.get("done") === "1";

  const [open, setOpen] = useState<boolean | null>(null);
  const [billing, setBilling] = useState<MyBilling | null | undefined>(undefined);
  // "Waiting for Stripe" — after coming back from checkout, or while
  // the desktop app's browser has the checkout open.
  const [waiting, setWaiting] = useState(done);

  useEffect(() => {
    loadFlags().then((f) => setOpen(f.has("pro_sales")));
    getMyBilling().then(setBilling);
  }, [user]);

  // Poll while waiting: every 3s, for up to 10 minutes (the time it
  // takes to type a card, then some). Stops the moment Pro arrives.
  useEffect(() => {
    if (!waiting) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const b = await getMyBilling();
      if (b) setBilling(b);
      if ((b && b.subscription && b.pro) || tries > 200) {
        clearInterval(timer);
        setWaiting(false);
      }
    }, 3_000);
    return () => clearInterval(timer);
  }, [waiting]);

  // Clean `?done=1` off the address once it's done its job, so a
  // refresh doesn't start the wait again.
  useEffect(() => {
    if (done && !waiting && billing?.subscription) {
      params.delete("done");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  if (open === null || billing === undefined) return <FullScreenLoader />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="display text-2xl">Pentra Pro</h1>
          <ProBadge />
        </div>
        <p className="mt-1 text-sm text-muted">
          More of Pentra, and a little gold on everything you post.
        </p>
      </header>

      {billing === null ? (
        <Alert>
          Couldn't load your plan. Check your connection and refresh.
        </Alert>
      ) : waiting ? (
        <Waiting done={done} />
      ) : billing.permanent ? (
        <Permanent />
      ) : billing.subscription ? (
        <Member billing={billing} onRefresh={() => getMyBilling().then(setBilling)} />
      ) : !open ? (
        <NotYet pro={billing.pro} expires={billing.expires_at} />
      ) : (
        <Buy billing={billing} onWaiting={() => setWaiting(true)} />
      )}

      <Perks />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  States                                                             */
/* ------------------------------------------------------------------ */

function Waiting({ done }: { done: boolean }) {
  return (
    <section className="mb-8 notch border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <div className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent" />
        <div>
          <h2 className="font-semibold">
            {done ? "Payment received — switching Pro on…" : "Finish up in your browser"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {done
              ? "This usually takes a few seconds. You can leave this page; Pro arrives either way."
              : "The checkout opened in your browser. This page updates by itself once you're done."}
          </p>
        </div>
      </div>
    </section>
  );
}

function Permanent() {
  return (
    <section className="mb-8 notch border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-semibold">You have Pentra Pro, for good.</h2>
      <p className="mt-1 text-sm text-muted">
        No end date and nothing to pay. Every perk below is yours.
      </p>
    </section>
  );
}

function NotYet({ pro, expires }: { pro: boolean; expires: string | null }) {
  return (
    <section className="mb-8 notch border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-semibold">
        {pro ? "You have Pentra Pro." : "Pentra Pro isn't on sale yet."}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {pro && expires
          ? `Yours until ${day(expires)}. Subscriptions open soon — paid time adds on to what you have.`
          : "Subscriptions open soon. Here's what's in it."}
      </p>
    </section>
  );
}

/** A subscriber: what they're on, when it renews or ends, and the door to Stripe. */
function Member({ billing, onRefresh }: { billing: MyBilling; onRefresh: () => void }) {
  const s = billing.subscription!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = PRICES[s.plan];
  const live = renews(billing);
  const ends = billing.expires_at;

  async function manage() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const msg = await openBillingPortal();
    setBusy(false);
    if (msg) setError(msg);
  }

  return (
    <section className="relative mb-8 notch p-px" style={{ background: PRO_GOLD }}>
      <div className="notch bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">
              {live ? "You're a Pentra Pro member." : "Your subscription is ending."}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {price.label} plan — ${price.billed.toFixed(2)}
              {s.plan === "monthly" ? " a month" : " a year"}.{" "}
              {live
                ? s.current_period_end
                  ? `Renews ${day(s.current_period_end)}.`
                  : ""
                : ends
                  ? `Pro stays on until ${day(ends)}, then stops. Nothing more is charged.`
                  : "Nothing more is charged."}
            </p>
            {s.status === "past_due" && (
              <p className="mt-2 text-sm text-danger">
                The last payment didn't go through. Update your card below to keep Pro.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={manage}
            disabled={busy}
            className="notch-md border border-line px-4 py-2 text-sm font-semibold transition hover:border-muted disabled:opacity-50"
          >
            {busy ? "Opening…" : live ? "Manage or cancel" : "Manage billing"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Managing opens Stripe, where you can change your card, see
          receipts, or cancel. Cancelling stops the renewal; Pro runs to
          the end of what you've paid for.{" "}
          <button type="button" onClick={onRefresh} className="text-accent hover:underline">
            Refresh
          </button>{" "}
          after making a change.
        </p>
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 right-4 top-0 h-[3px]"
        style={{ background: PRO_GOLD }}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Buying                                                             */
/* ------------------------------------------------------------------ */

function Buy({ billing, onWaiting }: { billing: MyBilling; onWaiting: () => void }) {
  const [plan, setPlan] = useState<Plan>("yearly");
  const [code, setCode] = useState(rememberedCreatorCode());
  const [check, setCheck] = useState<CodeCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  // Check the code as it's typed, a beat after the last keystroke.
  useEffect(() => {
    const trimmed = code.trim();
    const id = ++latest.current;
    if (trimmed.length < 3) {
      setCheck(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    const t = setTimeout(async () => {
      const r = await checkCreatorCode(trimmed);
      if (id !== latest.current) return;
      setCheck(r);
      setChecking(false);
    }, 350);
    return () => clearTimeout(t);
  }, [code]);

  const codeOk = Boolean(check?.ok && check.first_time);
  const discount = codeOk ? CREATOR_DISCOUNT[plan] : 0;
  const first = Math.round(PRICES[plan].billed * (100 - discount)) / 100;

  async function checkout() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const msg = await startCheckout(plan, codeOk ? code : "");
    setBusy(false);
    if (msg) {
      setError(msg);
      return;
    }
    if (codeOk) forgetCreatorCode();
    // In a browser this tab is already on its way to Stripe. In the
    // desktop app, the browser has it; wait here.
    if (isDesktopApp()) onWaiting();
  }

  return (
    <section className="mb-8">
      {billing.pro && billing.expires_at && (
        <p className="mb-4 text-sm text-muted">
          You have Pro until {day(billing.expires_at)}. A subscription adds
          its time on top — nothing is lost.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(["yearly", "monthly"] as const).map((p) => (
          <PlanCard
            key={p}
            plan={p}
            active={plan === p}
            discount={codeOk ? CREATOR_DISCOUNT[p] : 0}
            onPick={() => setPlan(p)}
          />
        ))}
      </div>

      {/* Promo code (a creator partner's). Only first-time subscribers get the discount;
          the database knows whether this account has paid before. */}
      <div className="mt-4 notch-md border border-line bg-surface p-4">
        <label htmlFor="creator-code" className="label-wide text-muted">
          Promo code <span className="normal-case tracking-normal">(optional)</span>
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="creator-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={20}
            placeholder="Have a code? Enter it here"
            spellCheck={false}
            autoCapitalize="characters"
            className="numeric min-w-0 flex-1 notch-md border border-line bg-surface-2 px-3 py-2 text-sm uppercase outline-none transition placeholder:normal-case placeholder:text-muted focus:border-accent"
          />
        </div>
        <p className="mt-2 min-h-[1.25rem] text-xs">
          {code.trim().length < 3 ? (
            /* Nothing until a code is typed: the discount is the code's
               to reveal, not the page's to advertise. */
            <span />
          ) : checking ? (
            <span className="text-muted">Checking…</span>
          ) : check === null ? (
            <span className="text-muted">Couldn't check that code. Try again in a moment.</span>
          ) : !check.ok ? (
            <span className="text-danger">That code isn't valid or isn't active.</span>
          ) : !check.first_time ? (
            <span className="text-muted">Promo codes are for your first subscription only.</span>
          ) : (
            <span className="text-ok">
              {check.creator_name}'s code: {CREATOR_DISCOUNT[plan]}% off your first{" "}
              {plan === "monthly" ? "month" : "year"}.
            </span>
          )}
        </p>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <button
        type="button"
        onClick={checkout}
        disabled={busy || (code.trim().length >= 3 && !codeOk)}
        className="notch-md mt-4 flex w-full items-center justify-center gap-2 px-5 py-3.5 text-sm font-bold transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: PRO_GOLD, color: ON_GOLD }}
      >
        {busy
          ? "Opening checkout…"
          : `Continue to checkout — $${first.toFixed(2)} ${plan === "monthly" ? "today" : "for the year"}`}
        <LockIcon />
      </button>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        Paid securely through Stripe; Pentra never sees your card. Renews
        automatically at ${PRICES[plan].billed.toFixed(2)}
        {plan === "monthly" ? " a month" : " a year"} until you cancel, which
        you can do any time from Settings — Pro then runs to the end of
        the paid period. Full refund on request within {REFUND_DAYS} days
        of your first payment, once per account. See the{" "}
        <Link to="/terms" className="text-accent hover:underline">terms</Link>.
      </p>
    </section>
  );
}

function PlanCard({
  plan,
  active,
  discount,
  onPick,
}: {
  plan: Plan;
  active: boolean;
  discount: number;
  onPick: () => void;
}) {
  const p = PRICES[plan];
  const first = Math.round(p.billed * (100 - discount)) / 100;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={
        "relative notch p-px text-left transition " +
        (active ? "" : "hover:brightness-110")
      }
      style={{ background: active ? PRO_GOLD : "var(--color-line)" }}
    >
      <div className="notch h-full bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <span className="label-wide text-muted">{p.label}</span>
          {plan === "yearly" && (
            <span
              className="notch-sm px-2 py-0.5 text-3xs font-bold uppercase tracking-wider"
              style={{ background: PRO_GOLD, color: ON_GOLD }}
            >
              Save 17%
            </span>
          )}
        </div>
        <p className="mt-3">
          <span className="display text-3xl">${p.perMonth.toFixed(2)}</span>
          <span className="text-sm text-muted"> / month</span>
        </p>
        <p className="mt-1 text-xs text-muted">{p.note}</p>
        {discount > 0 && (
          <p className="mt-2 text-xs font-semibold text-ok">
            First {plan === "monthly" ? "month" : "year"} ${first.toFixed(2)} with your code
          </p>
        )}
      </div>
      {active && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 right-4 top-0 h-[3px]"
          style={{ background: PRO_GOLD }}
        />
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  What's in it                                                       */
/* ------------------------------------------------------------------ */

const PERKS = [
  { title: "The gold badge", note: "PRO beside your name, on your profile and every post." },
  { title: "30 avatar frames", note: "Drawn for Pentra. Sixteen of them turn." },
  { title: "Moving profile backgrounds", note: "Drift, Nebula, Starfall, Embers, Scan, Tide and Cipher." },
  { title: "Pro avatars and backgrounds", note: "Fifty avatars and forty backgrounds, only for members." },
  { title: "Gold posts and sessions", note: "Everything you post gets the gold edge in everyone's feed." },
  { title: "No session limits", note: "Host and join as many sessions as you like." },
];

function Perks() {
  return (
    <section>
      <h2 className="label-wide mb-3 text-muted">What you get</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {PERKS.map((perk) => (
          <li key={perk.title} className="flex gap-3 notch-md border border-line bg-surface p-3.5">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center notch-sm"
              style={{ background: PRO_GOLD, color: ON_GOLD }}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 5 5L20 7" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold">{perk.title}</p>
              <p className="text-xs text-muted">{perk.note}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="1" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
