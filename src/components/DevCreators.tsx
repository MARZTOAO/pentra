import { useCallback, useEffect, useState } from "react";
import {
  CREATOR_DISCOUNT,
  REFUND_DAYS,
  addCreator,
  listCreators,
  lookupBilling,
  money,
  recordPayout,
  setCreatorActive,
  type BillingLookup,
  type CreatorRow,
} from "../lib/billing";

/**
 * DevPanel → Creators. The YouTuber partner programme (supabase/87):
 * codes, what each one has brought in, what's owed, payouts recorded —
 * and a refund lookup for answering "can I have my money back".
 *
 * Money moves outside Pentra. Payouts are sent by hand (PayPal or
 * whatever was agreed) and recorded here; refunds are issued in the
 * Stripe Dashboard and the webhook takes the time back. This tab is
 * the ledger, not the bank.
 */
export function DevCreators() {
  const [rows, setRows] = useState<CreatorRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    listCreators().then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, []);

  useEffect(load, [load]);

  const owed = rows?.reduce((sum, r) => sum + r.owed_cents, 0) ?? 0;

  return (
    <div className="space-y-6">
      <p className="text-xs leading-relaxed text-muted">
        Partners share a code; their viewers get {CREATOR_DISCOUNT.monthly}% off a
        first month or {CREATOR_DISCOUNT.yearly}% off a first year. A signup counts
        for the partner {REFUND_DAYS} days after it's paid (the refund window)
        and pays $0.50 / $10 for their first 1,000, then $1.00 / $15. Link to
        share: <span className="numeric text-ink">pentra.gg/?creator=CODE</span>
      </p>

      <NewCreator onAdded={load} />

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="label-wide text-muted">
            Partners {rows ? `(${rows.length})` : ""}
            {owed > 0 && <span className="ml-2 text-accent">{money(owed)} owed</span>}
          </h3>
          <button onClick={load} className="text-2xs font-semibold text-muted transition hover:text-ink">
            Refresh
          </button>
        </div>

        {loading && !rows ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : rows === null ? (
          <p className="text-sm text-danger">
            Couldn't load. Has supabase/87_pentra_pro_billing.sql been run?
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">No partners yet. Add the first code above.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Creator key={r.code} row={r} onChange={load} />
            ))}
          </div>
        )}
      </section>

      <RefundLookup />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NewCreator({ onAdded }: { onAdded: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function add() {
    if (busy) return;
    setBusy(true);
    const err = await addCreator(code, name, contact);
    setBusy(false);
    if (err) {
      setStatus(err);
      return;
    }
    setStatus(`${code.toUpperCase()} added. Send them the link above with their code in it.`);
    setCode("");
    setName("");
    setContact("");
    onAdded();
  }

  return (
    <div className="notch-md border border-line bg-surface-2 p-3">
      <p className="label-wide mb-2 text-muted">New partner</p>
      <div className="flex flex-wrap gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          placeholder="CODE (3–20 letters/numbers)"
          maxLength={20}
          spellCheck={false}
          className="numeric min-w-0 flex-1 notch-md border border-line bg-surface px-2.5 py-1.5 text-sm uppercase outline-none placeholder:normal-case focus:border-accent"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Creator / channel name"
          maxLength={80}
          className="min-w-0 flex-1 notch-md border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Email / how to pay them (optional)"
          maxLength={160}
          className="min-w-0 flex-[1.5] notch-md border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button
          onClick={add}
          disabled={busy || code.length < 3 || !name.trim()}
          className="notch-md bg-accent px-3 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {status && <p className="mt-2 text-xs text-muted">{status}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Creator({ row, onChange }: { row: CreatorRow; onChange: () => void }) {
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const err = await setCreatorActive(row.code, !row.active);
    setBusy(false);
    if (err) setStatus(err);
    else onChange();
  }

  async function pay() {
    const cents = Math.round(Number(amount) * 100);
    if (busy || !cents) return;
    setBusy(true);
    const err = await recordPayout(row.code, cents, note);
    setBusy(false);
    if (err) {
      setStatus(err);
      return;
    }
    setStatus(`${money(cents)} recorded.`);
    setAmount("");
    setNote("");
    setPaying(false);
    onChange();
  }

  const stat = "numeric text-xs text-muted";

  return (
    <div className={"notch-md border border-line p-3 " + (row.active ? "" : "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="numeric font-bold tracking-wider">{row.code}</span>
        <span className="min-w-0 flex-1 truncate text-sm">{row.creator_name}</span>
        {!row.active && (
          <span className="notch-sm border border-line px-1.5 text-3xs text-muted">off</span>
        )}
        <span className={"text-sm font-semibold " + (row.owed_cents > 0 ? "text-accent" : "text-muted")}>
          {money(row.owed_cents)} owed
        </span>
      </div>

      {row.contact && <p className="mt-1 truncate text-xs text-muted">{row.contact}</p>}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <span className={stat}>{row.monthly} monthly</span>
        <span className={stat}>{row.yearly} yearly</span>
        <span className={stat} title={`Paid less than ${REFUND_DAYS} days ago — not payable yet`}>
          {row.pending} pending
        </span>
        <span className={stat}>{row.refunded} refunded</span>
        <span className={stat}>{row.payable} payable</span>
        <span className={stat}>earned {money(row.earned_cents)}</span>
        <span className={stat}>
          paid {money(row.paid_cents)}
          {row.last_paid_at ? ` (last ${new Date(row.last_paid_at).toLocaleDateString()})` : ""}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={() => setPaying((v) => !v)}
          disabled={busy}
          className="notch-sm border border-line px-2 py-1 text-2xs font-semibold text-muted transition hover:text-ink"
        >
          {paying ? "Cancel" : "Record a payout"}
        </button>
        <button
          onClick={toggle}
          disabled={busy}
          className="notch-sm border border-line px-2 py-1 text-2xs font-semibold text-muted transition hover:text-ink"
        >
          {row.active ? "Switch code off" : "Switch code on"}
        </button>
      </div>

      {paying && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder={row.owed_cents > 0 ? (row.owed_cents / 100).toFixed(2) : "0.00"}
            className="numeric w-28 notch-md border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How it was sent (optional)"
            maxLength={120}
            className="min-w-0 flex-1 notch-md border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={pay}
            disabled={busy || !(Number(amount) > 0)}
            className="notch-md bg-accent px-3 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
          >
            Record {Number(amount) > 0 ? money(Math.round(Number(amount) * 100)) : ""}
          </button>
        </div>
      )}
      {status && <p className="mt-2 text-xs text-muted">{status}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RefundLookup() {
  const [who, setWho] = useState("");
  const [result, setResult] = useState<BillingLookup | null | string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function look() {
    const name = who.trim();
    if (!name || busy) return;
    setBusy(true);
    setResult(await lookupBilling(name));
    setBusy(false);
  }

  return (
    <section>
      <h3 className="label-wide mb-2 text-muted">Refund check</h3>
      <p className="mb-2 text-2xs text-muted">
        Someone asks for a refund: look them up. "Refundable" means their
        first payment, within {REFUND_DAYS} days, and no refund on the account
        before. If so, refund that payment in full in the Stripe Dashboard
        (search the id in Payments or Invoices); Pentra takes the time back and cancels
        the subscription by itself.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          look();
        }}
        className="flex gap-2"
      >
        <input
          value={who}
          onChange={(e) => setWho(e.target.value)}
          placeholder="username"
          spellCheck={false}
          className="min-w-0 flex-1 notch-md border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !who.trim()}
          className="notch-md border border-line px-3 py-1.5 text-xs font-semibold transition hover:border-muted disabled:opacity-40"
        >
          Look up
        </button>
      </form>

      {result === undefined ? null : result === null ? (
        <p className="mt-2 text-xs text-muted">No player with that name.</p>
      ) : typeof result === "string" ? (
        <p className="mt-2 text-xs text-danger">{result}</p>
      ) : (
        <div className="mt-3 notch-md border border-line p-3">
          <p className="text-sm">
            <span className="font-semibold">{result.username}</span>
            <span className="ml-2 text-xs text-muted">
              {result.customer_id ? `Stripe customer ${result.customer_id}` : "never checked out"}
              {" · "}
              {result.refunds_used} refund{result.refunds_used === 1 ? "" : "s"} used
            </span>
          </p>
          {result.payments.length === 0 ? (
            <p className="mt-2 text-xs text-muted">No payments.</p>
          ) : (
            <div className="mt-2 divide-y divide-line">
              {result.payments.map((p) => (
                <div key={p.invoice_id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-xs">
                  <span className="numeric text-muted">{new Date(p.paid_at).toLocaleDateString()}</span>
                  <span className="font-semibold">{money(p.amount_cents)}</span>
                  <span className="text-muted">{p.plan}</span>
                  {p.first_payment && <span className="text-muted">first</span>}
                  {p.creator_code && <span className="numeric text-muted">{p.creator_code}</span>}
                  <span className="numeric min-w-0 flex-1 truncate text-muted" title={p.invoice_id}>
                    {p.invoice_id}
                  </span>
                  {p.refunded_at ? (
                    <span className="text-danger">refunded {new Date(p.refunded_at).toLocaleDateString()}</span>
                  ) : p.refundable ? (
                    <span className="font-semibold text-ok">refundable</span>
                  ) : (
                    <span className="text-muted">not refundable</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
