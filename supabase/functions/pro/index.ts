// ============================================================
//  pro — Pentra Pro billing (Supabase Edge Function).
//
//  One function, three jobs:
//
//    POST { action: "checkout", plan, code }  → { url }   a Stripe Checkout page
//    POST { action: "portal" }                → { url }   Stripe's "manage billing" page
//    POST /pro/webhook  (from Stripe)                     turns Pro on, off, back;
//                                                         marks disputed payments
//
//  Stripe webhook events it needs: invoice.paid, charge.refunded,
//  charge.dispute.created, charge.dispute.closed,
//  customer.subscription.created / .updated / .deleted.
//
//  The app calls the first two with the signed-in player's token; the
//  webhook is called by Stripe and proves itself with a signature. So
//  "Verify JWT" must be OFF for this function — it checks the player
//  itself (see `currentUser`) and checks Stripe's signature itself.
//
//  No libraries: Stripe's API is plain HTTPS + form fields, and the
//  database is reached through its own billing_* functions (supabase/
//  87_pentra_pro_billing.sql), which only the service role can call.
//  Fewer moving parts, nothing to update, and every Stripe object is
//  re-fetched with one pinned API version so the shapes never shift.
//
//  SECRETS (Supabase → Edge Functions → Secrets — never in the repo,
//  the app, or a chat):
//    STRIPE_SECRET_KEY       sk_test_… now, sk_live_… at launch
//    STRIPE_WEBHOOK_SECRET   whsec_… from the Stripe webhook endpoint
//  Provided by Supabase automatically:
//    SUPABASE_URL, and the project's API keys — the legacy
//    SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY, or the newer
//    SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS (either works).
//  Optional:
//    SITE_URL                defaults to https://pentra.gg
// ============================================================

const STRIPE_VERSION = "2024-06-20";

const env = (k: string) => Deno.env.get(k) ?? "";

/** A key from the newer JSON dictionaries ({"default": "sb_…"}). */
function fromDict(name: string): string {
  try {
    const d = JSON.parse(env(name) || "{}");
    return d.default ?? Object.values(d)[0] ?? "";
  } catch {
    return "";
  }
}
const serviceKey = () => env("SUPABASE_SERVICE_ROLE_KEY") || fromDict("SUPABASE_SECRET_KEYS");
const anonKey = () => env("SUPABASE_ANON_KEY") || fromDict("SUPABASE_PUBLISHABLE_KEYS");
const SITE = () => (env("SITE_URL") || "https://pentra.gg").replace(/\/+$/, "");

// The plans. Prices and creator coupons are created in Stripe the first
// time they're needed (test mode and live mode each get their own), so
// there's nothing to set up by hand in the Stripe dashboard.
const PLANS = {
  monthly: { lookup: "pentra_pro_monthly", cents: 599, interval: "month", coupon: "creator_monthly_25", off: 25, couponName: "Creator code: 25% off your first month" },
  yearly: { lookup: "pentra_pro_yearly", cents: 5988, interval: "year", coupon: "creator_yearly_30", off: 30, couponName: "Creator code: 30% off your first year" },
} as const;
type Plan = keyof typeof PLANS;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/* ------------------------------------------------------------------ */
/*  Stripe                                                             */
/* ------------------------------------------------------------------ */

/** {a: {b: 1}, c: [{d: 2}]} → a[b]=1&c[0][d]=2 — Stripe's form format. */
export function formEncode(obj: Record<string, unknown>): string {
  const out: string[] = [];
  const walk = (value: unknown, key: string) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${key}[${i}]`));
    else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, `${key}[${k}]`);
    } else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };
  for (const [k, v] of Object.entries(obj)) walk(v, k);
  return out.join("&");
}

class StripeError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

// deno-lint-ignore no-explicit-any
async function stripe(method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, unknown>): Promise<any> {
  let url = `https://api.stripe.com${path}`;
  let body: string | undefined;
  if (params && method === "GET") url += (url.includes("?") ? "&" : "?") + formEncode(params);
  else if (params) body = formEncode(params);

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`,
      "Stripe-Version": STRIPE_VERSION,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new StripeError(data?.error?.message ?? `Stripe ${res.status}`, res.status, data?.error?.code);
  return data;
}

/** The plan's recurring price, created on first use. */
async function ensurePrice(plan: Plan): Promise<string> {
  const p = PLANS[plan];
  const found = await stripe("GET", "/v1/prices", { "lookup_keys[]": p.lookup, active: true, limit: 1 });
  if (found.data?.length) return found.data[0].id;

  try {
    await stripe("POST", "/v1/products", { id: "pentra_pro", name: "Pentra Pro" });
  } catch (e) {
    if (!(e instanceof StripeError && e.code === "resource_already_exists")) throw e;
  }
  const price = await stripe("POST", "/v1/prices", {
    product: "pentra_pro",
    currency: "usd",
    unit_amount: p.cents,
    recurring: { interval: p.interval },
    lookup_key: p.lookup,
    nickname: plan === "yearly" ? "Pentra Pro — yearly" : "Pentra Pro — monthly",
  });
  return price.id;
}

/** The creator-code coupon for the plan, created on first use. */
async function ensureCoupon(plan: Plan): Promise<string> {
  const p = PLANS[plan];
  try {
    await stripe("GET", `/v1/coupons/${p.coupon}`);
  } catch (e) {
    if (!(e instanceof StripeError && e.status === 404)) throw e;
    await stripe("POST", "/v1/coupons", { id: p.coupon, percent_off: p.off, duration: "once", name: p.couponName });
  }
  return p.coupon;
}

/** Checks Stripe's signature on a webhook (HMAC-SHA256, 5-minute tolerance). */
export async function verifyStripeSignature(raw: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(",").map((s) => s.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || sigs.length === 0) return false;
  if (Math.abs(nowSec - Number(t)) > 300) return false;

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => timingSafeEqual(s, expected));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/*  Supabase                                                           */
/* ------------------------------------------------------------------ */

// deno-lint-ignore no-explicit-any
async function rpc(name: string, args: Record<string, unknown>): Promise<any> {
  const key = serviceKey();
  // A legacy service_role key is a JWT and goes in both headers; a new
  // sb_secret_… key goes in apikey only (Supabase rejects it as a Bearer).
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

/** The signed-in player making the request, or null. */
async function currentUser(req: Request): Promise<{ id: string; email: string | null } | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const res = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: anonKey() },
  });
  if (!res.ok) return null;
  const u = await res.json();
  return u?.id ? { id: u.id, email: u.email ?? null } : null;
}

/* ------------------------------------------------------------------ */
/*  Checkout and portal                                                */
/* ------------------------------------------------------------------ */

async function checkout(user: { id: string; email: string | null }, body: { plan?: string; code?: string }) {
  const plan: Plan = body.plan === "yearly" ? "yearly" : "monthly";
  const typed = (body.code ?? "").trim();
  const ctx = await rpc("billing_checkout_context", { p_user: user.id, p_code: typed || null });

  if (!ctx.sales_open) return json({ error: "not_open", message: "Pentra Pro isn't on sale yet." }, 403);
  if (ctx.permanent) return json({ error: "permanent", message: "You already have Pentra Pro for good." }, 409);
  if (ctx.active_subscription) return json({ error: "already_subscribed", message: "You already have a subscription. Manage it from Settings." }, 409);
  if (typed && !ctx.code_ok) return json({ error: "bad_code", message: "That creator code isn't valid." }, 400);
  if (typed && !ctx.first_time) return json({ error: "code_first_time", message: "Creator codes are for your first subscription only." }, 400);

  const price = await ensurePrice(plan);

  let customer: string | null = ctx.customer_id;
  if (!customer) {
    const c = await stripe("POST", "/v1/customers", { email: user.email ?? undefined, metadata: { user_id: user.id } });
    customer = c.id as string;
    await rpc("billing_set_customer", { p_user: user.id, p_customer: customer });
  }

  const useCode = Boolean(typed && ctx.code_ok && ctx.first_time);
  const coupon = useCode ? await ensureCoupon(plan) : null;
  const meta = { user_id: user.id, plan, creator_code: useCode ? ctx.code : "" };

  const session = await stripe("POST", "/v1/checkout/sessions", {
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    discounts: coupon ? [{ coupon }] : undefined,
    success_url: `${SITE()}/#/pro?done=1`,
    cancel_url: `${SITE()}/#/pro`,
    metadata: meta,
    subscription_data: { metadata: meta },
    custom_text: {
      submit: {
        message: "Renews automatically until you cancel — cancel any time in Pentra's Settings. Full refund within 14 days of your first payment (one refund per account).",
      },
    },
  });
  return json({ url: session.url });
}

async function portal(user: { id: string }) {
  const ctx = await rpc("billing_checkout_context", { p_user: user.id, p_code: null });
  if (!ctx.customer_id) return json({ error: "no_customer", message: "There's no billing to manage yet." }, 404);
  const s = await stripe("POST", "/v1/billing_portal/sessions", {
    customer: ctx.customer_id,
    return_url: `${SITE()}/#/settings`,
  });
  return json({ url: s.url });
}

/* ------------------------------------------------------------------ */
/*  Webhook                                                            */
/* ------------------------------------------------------------------ */

// deno-lint-ignore no-explicit-any
function planOf(sub: any): Plan {
  return sub?.items?.data?.[0]?.price?.recurring?.interval === "year" ? "yearly" : "monthly";
}

const iso = (sec: number | null | undefined) => (sec ? new Date(sec * 1000).toISOString() : null);

// deno-lint-ignore no-explicit-any
async function syncSubscription(sub: any) {
  const user = sub?.metadata?.user_id;
  if (!user) return;
  await rpc("billing_sync_subscription", {
    p_sub: sub.id,
    p_user: user,
    p_plan: planOf(sub),
    p_status: sub.status,
    p_cancel: Boolean(sub.cancel_at_period_end),
    p_period_end: iso(sub.current_period_end),
    p_code: sub.metadata?.creator_code || null,
  });
}

async function onInvoicePaid(invoiceId: string) {
  const inv = await stripe("GET", `/v1/invoices/${invoiceId}`);
  if (!inv.subscription || inv.status !== "paid") return;
  const sub = await stripe("GET", `/v1/subscriptions/${inv.subscription}`);
  const user = sub.metadata?.user_id;
  if (!user) {
    console.warn(`invoice ${inv.id}: subscription ${sub.id} has no user_id`);
    return;
  }
  await rpc("billing_apply_payment", {
    p_invoice: inv.id,
    p_user: user,
    p_sub: sub.id,
    p_plan: planOf(sub),
    p_amount: inv.amount_paid ?? 0,
    p_currency: inv.currency ?? "usd",
    p_pi: inv.payment_intent ?? null,
    p_code: sub.metadata?.creator_code || null,
    p_paid_at: iso(inv.status_transitions?.paid_at ?? inv.created),
  });
  await syncSubscription(sub);
}

async function onChargeRefunded(chargeId: string) {
  const ch = await stripe("GET", `/v1/charges/${chargeId}`);
  // Only a FULL refund takes Pro time back; a partial refund is a
  // goodwill gesture and changes nothing here.
  if (!ch.refunded || !ch.payment_intent) return;
  const result = await rpc("billing_apply_refund", { p_pi: ch.payment_intent });
  const subId = result?.subscription_id;
  if (!subId) return;
  const sub = await stripe("GET", `/v1/subscriptions/${subId}`);
  if (sub.status !== "canceled") {
    const ended = await stripe("DELETE", `/v1/subscriptions/${subId}`);
    await syncSubscription(ended);
  }
}

/**
 * A subscriber disputed a charge with their bank (a chargeback, or an
 * inquiry that might become one). The payment stops counting for the
 * creator whose code it carried until the dispute is closed in
 * Pentra's favour — see supabase/100_creator_disputes.sql.
 */
async function onDispute(disputeId: string, open: boolean) {
  const d = await stripe("GET", `/v1/disputes/${disputeId}`);
  let pi: string | null = d.payment_intent ?? null;
  if (!pi && d.charge) pi = (await stripe("GET", `/v1/charges/${d.charge}`)).payment_intent ?? null;
  if (!pi) return;
  // Closed: only "won" (and an inquiry closed with no chargeback,
  // "warning_closed") clears the mark. "lost" keeps it.
  if (!open && d.status !== "won" && d.status !== "warning_closed") return;
  await rpc("billing_apply_dispute", { p_pi: pi, p_open: open });
}

async function webhook(req: Request) {
  const raw = await req.text();
  const ok = await verifyStripeSignature(raw, req.headers.get("stripe-signature"), env("STRIPE_WEBHOOK_SECRET"));
  if (!ok) return json({ error: "bad signature" }, 400);

  const event = JSON.parse(raw);
  const id = event?.data?.object?.id as string | undefined;
  if (!id) return json({ received: true });

  switch (event.type) {
    case "invoice.paid":
      await onInvoicePaid(id);
      break;
    case "charge.refunded":
      await onChargeRefunded(id);
      break;
    case "charge.dispute.created":
      await onDispute(id, true);
      break;
    case "charge.dispute.closed":
      await onDispute(id, false);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(await stripe("GET", `/v1/subscriptions/${id}`));
      break;
  }
  return json({ received: true });
}

/* ------------------------------------------------------------------ */

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  try {
    if (new URL(req.url).pathname.endsWith("/webhook")) return await webhook(req);

    const user = await currentUser(req);
    if (!user) return json({ error: "signed_out", message: "Sign in first." }, 401);

    const body = await req.json().catch(() => ({}));
    if (body.action === "checkout") return await checkout(user, body);
    if (body.action === "portal") return await portal(user);
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    // A 500 makes Stripe retry a webhook later, which is what we want
    // if the database was briefly unreachable.
    console.error(e);
    return json({ error: "server", message: "Something went wrong. Try again in a minute." }, 500);
  }
}

Deno.serve(handle);
