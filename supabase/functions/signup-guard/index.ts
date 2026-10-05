// ============================================================
//  signup-guard — keeps bots from creating accounts.
//
//  Supabase calls this before EVERY new account is created (Auth →
//  Hooks → "Before User Created", pointed at this function). It says
//  yes or no. Because it runs on Supabase's side, a bot can't skip it
//  by calling the sign-up API directly instead of using the app.
//
//  Two checks:
//    1. The email isn't from a throwaway inbox service.
//    2. A Cloudflare Turnstile token came with the sign-up and
//       Cloudflare says it's genuine (a real browser, almost always a
//       real person). The sign-up page puts it in the account's
//       metadata as `captcha_token`; see src/components/BotCheck.tsx.
//
//  Only sign-up is checked — never sign-in — so the iPhone and Windows
//  apps (where Turnstile doesn't run) still sign in normally. They send
//  people to pentra.gg to create an account.
//
//  Accounts made by scripts/seed-players.mjs carry app_metadata.seeded,
//  which only the service role can set, and skip both checks.
//
//  "Verify JWT" must be OFF: Supabase proves itself with a signature
//  (Standard Webhooks), checked below.
//
//  SECRETS (Supabase → Edge Functions → Secrets):
//    SIGNUP_HOOK_SECRET    v1,whsec_… — shown when the hook is created
//    TURNSTILE_SECRET_KEY  from Cloudflare → Turnstile → the Pentra
//                          widget. While it's missing, check 2 is
//                          skipped (so the hook can go in first).
// ============================================================

const env = (k: string) => Deno.env.get(k) ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * The answer Supabase understands as "don't create this account".
 *
 * Sent with status 200 on purpose: Supabase only reads the error (and
 * shows our message to the person) when the hook call itself
 * succeeded. Any 4xx reply is treated as the hook failing, and the
 * person sees a generic "Invalid payload sent to hook" instead.
 */
const refuse = (message: string) => json({ error: { http_code: 400, message } }, 200);

/**
 * Throwaway inbox services. Not every one in existence — the common
 * ones bots use. Add a domain here (lower case) if one shows up.
 */
const DISPOSABLE = new Set([
  "10minutemail.com", "10minutemail.net", "20minutemail.com", "33mail.com",
  "anonaddy.me", "burnermail.io", "discard.email", "dispostable.com",
  "dropmail.me", "emailondeck.com", "fakeinbox.com", "fakemail.net",
  "getairmail.com", "getnada.com", "guerrillamail.com", "guerrillamail.net",
  "guerrillamail.org", "guerrillamail.biz", "guerrillamailblock.com",
  "grr.la", "sharklasers.com", "harakirimail.com", "inboxkitten.com",
  "mail.tm", "mailcatch.com", "maildrop.cc", "mailinator.com",
  "mailinator.net", "mailnesia.com", "mailpoof.com", "mintemail.com",
  "mohmal.com", "moakt.com", "mytemp.email", "nada.email", "spambox.us",
  "spamgourmet.com", "temp-mail.org", "temp-mail.io", "tempail.com",
  "tempmail.com", "tempmail.net", "tempmail.dev", "tempmailo.com",
  "tempr.email", "throwawaymail.com", "trashmail.com", "trashmail.de",
  "yopmail.com", "yopmail.net", "yopmail.fr", "emailfake.com",
  "1secmail.com", "1secmail.net", "1secmail.org", "linshiyouxiang.net",
]);

function isDisposable(email: string): boolean {
  const domain = email.split("@").pop()?.toLowerCase().trim() ?? "";
  if (!domain) return false;
  // Also catches subdomains: anything.mailinator.com.
  for (const d of DISPOSABLE) if (domain === d || domain.endsWith("." + d)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/*  Standard Webhooks signature (how Supabase signs hook calls)        */
/* ------------------------------------------------------------------ */

function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the request really came from Supabase, in the last 5 minutes. */
export async function verifyHook(raw: string, h: Headers, secret: string, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const id = h.get("webhook-id");
  const ts = h.get("webhook-timestamp");
  const sigHeader = h.get("webhook-signature");
  if (!id || !ts || !sigHeader || !secret) return false;
  if (Math.abs(nowSec - Number(ts)) > 300) return false;

  const keyB64 = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  const key = await crypto.subtle.importKey("raw", b64decode(keyB64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${raw}`)));
  const expected = b64encode(mac);

  // The header can hold several, space-separated: "v1,abc= v1,def=".
  return sigHeader.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    return version === "v1" && sig !== undefined && timingSafeEqual(sig, expected);
  });
}

/* ------------------------------------------------------------------ */
/*  Turnstile                                                          */
/* ------------------------------------------------------------------ */

/** "ok", "bad" (Cloudflare said no), or "unreachable" (couldn't ask). */
async function checkTurnstile(token: string, ip: string | undefined, secret: string): Promise<"ok" | "bad" | "unreachable"> {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    if (!r.ok) return "unreachable";
    const out = await r.json();
    return out.success === true ? "ok" : "bad";
  } catch {
    return "unreachable";
  }
}

/* ------------------------------------------------------------------ */

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const raw = await req.text();
  if (!(await verifyHook(raw, req.headers, env("SIGNUP_HOOK_SECRET")))) {
    return json({ error: "bad signature" }, 401);
  }

  // deno-lint-ignore no-explicit-any
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const user = payload?.user ?? {};
  const ip: string | undefined = payload?.metadata?.ip_address ?? payload?.ip_address ?? undefined;

  // Made by our own seed script with the service role.
  if (user.app_metadata?.seeded === true) return json({});

  const email = String(user.email ?? "");
  if (email && isDisposable(email)) {
    return refuse("Please use a permanent email address — throwaway inboxes can't sign up.");
  }

  const secret = env("TURNSTILE_SECRET_KEY");
  if (secret) {
    const token = String(user.user_metadata?.captcha_token ?? "");
    if (!token) {
      return refuse("We couldn't check you're a real person. Reload the page and try again.");
    }
    const result = await checkTurnstile(token, ip, secret);
    if (result === "bad") {
      return refuse("We couldn't check you're a real person. Reload the page and try again.");
    }
    // "unreachable": Cloudflare is down. Let the sign-up through rather
    // than locking everybody out; email verification still applies.
    if (result === "unreachable") console.warn("signup-guard: Turnstile unreachable, allowing", email);
  }

  return json({});
}

Deno.serve(handle);
