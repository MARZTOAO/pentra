// ============================================================
//  push — delivers Pentra notifications and chat messages to iPhones.
//
//  Called by the database (supabase/102_push_notifications.sql) with
//  { source: "notifications" | "messages", id }. It asks push_claim()
//  what to say and to whom — which also guarantees nothing is pushed
//  twice — then sends it through Apple's push service (APNs).
//
//  No password on the request, on purpose: the only thing it can do is
//  deliver a real, not-yet-pushed notification to its real recipient.
//  So "Verify JWT" must be OFF.
//
//  SECRETS (Supabase → Edge Functions → Secrets):
//    APNS_KEY_ID       the Key ID shown next to the key in the Apple
//                      developer portal (Keys)
//    APNS_TEAM_ID      7B7PG928BR
//    APNS_BUNDLE_ID    gg.pentra.app
//    APNS_PRIVATE_KEY  the whole contents of the AuthKey_XXXX.p8 file,
//                      including the BEGIN/END lines
//  Provided by Supabase: SUPABASE_URL and the service key.
// ============================================================

const env = (k: string) => Deno.env.get(k) ?? "";

function fromDict(name: string): string {
  try {
    const d = JSON.parse(env(name) || "{}");
    return d.default ?? Object.values(d)[0] ?? "";
  } catch {
    return "";
  }
}
const serviceKey = () => env("SUPABASE_SERVICE_ROLE_KEY") || fromDict("SUPABASE_SECRET_KEYS");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/* ------------------------------------------------------------------ */
/*  Supabase                                                           */
/* ------------------------------------------------------------------ */

// deno-lint-ignore no-explicit-any
async function rpc(name: string, args: Record<string, unknown>): Promise<any> {
  const key = serviceKey();
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

/* ------------------------------------------------------------------ */
/*  What the push says                                                 */
/* ------------------------------------------------------------------ */

type Claim = {
  kind: string;
  post_id?: number | null;
  conversation_id?: number | null;
  session?: boolean;
  actor?: string | null;
  actor_username?: string | null;
  game?: string | null;
  body?: string | null;
  tokens: { token: string; env: "production" | "sandbox" }[];
};

type Message = { title: string; body: string; url: string; thread: string };

/**
 * Same words as the bell (src/lib/notifications.ts), split into the
 * bold line and the sentence under it, the way iOS shows them.
 */
export function describe(c: Claim): Message | null {
  const who = c.actor || "Someone";
  const post = c.post_id ? `/p/${c.post_id}` : "/home";
  const yourSession = c.game ? `your ${c.game} session` : "your session";

  switch (c.kind) {
    case "message":
      return {
        title: c.session ? `${who} · ${c.game ? `${c.game} session` : "Session chat"}` : who,
        body: c.body || "Sent a message",
        url: "/messages",
        thread: `chat-${c.conversation_id}`,
      };
    case "friend_request":
      return { title: "Friend request", body: `${who} sent you a friend request.`, url: "/friends", thread: "friends" };
    case "friend_accepted":
      return {
        title: "Friend request accepted",
        body: `${who} accepted your friend request.`,
        url: c.actor_username ? `/u/${c.actor_username}` : "/friends",
        thread: "friends",
      };
    case "session_hour":
      return { title: "Session reminder", body: `${cap(yourSession)} starts within the hour.`, url: post, thread: "sessions" };
    case "session_day":
      return { title: "Session reminder", body: `${cap(yourSession)} is coming up soon.`, url: post, thread: "sessions" };
    case "friend_lfg":
      return { title: "Looking for players", body: `${who} is looking for players for ${c.game ?? "a game"}.`, url: post, thread: "lfg" };
    case "post_mention":
      return { title: "You were tagged", body: `${who} tagged you in a post.`, url: post, thread: "posts" };
    case "post_comment":
      return { title: "New comment", body: `${who} commented on your post.`, url: post, thread: "posts" };
    case "session_joined":
      return { title: "Your session", body: `${who} joined ${yourSession}.`, url: post, thread: "sessions" };
    case "session_left":
      return { title: "Your session", body: `${who} left ${yourSession}.`, url: post, thread: "sessions" };
    case "session_invite":
      return {
        title: "Session invite",
        body: c.game ? `${who} invited you to a ${c.game} session.` : `${who} invited you to a session.`,
        url: post,
        thread: "sessions",
      };
    default:
      return null;
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------------ */
/*  Apple (APNs)                                                       */
/* ------------------------------------------------------------------ */

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const b64urlText = (s: string) => b64url(new TextEncoder().encode(s));

let cachedJwt: { token: string; at: number } | null = null;

/** Apple's sign-in for the push service: a JWT signed with the .p8 key, good for an hour. */
async function apnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.at < 50 * 60) return cachedJwt.token;

  const pem = env("APNS_PRIVATE_KEY").replace(/\\n/g, "\n");
  const der = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")),
    (c) => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);

  const head = b64urlText(JSON.stringify({ alg: "ES256", kid: env("APNS_KEY_ID") }));
  const claims = b64urlText(JSON.stringify({ iss: env("APNS_TEAM_ID"), iat: now }));
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${claims}`)),
  );
  const token = `${head}.${claims}.${b64url(sig)}`;
  cachedJwt = { token, at: now };
  return token;
}

type Result = "ok" | "gone" | "wrong_server" | "error";

async function sendOne(token: string, server: "production" | "sandbox", m: Message): Promise<Result> {
  const host = server === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const res = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${await apnsJwt()}`,
      "apns-topic": env("APNS_BUNDLE_ID") || "gg.pentra.app",
      "apns-push-type": "alert",
      "apns-priority": "10",
    },
    body: JSON.stringify({
      aps: { alert: { title: m.title, body: m.body }, sound: "default", "thread-id": m.thread },
      url: m.url,
    }),
  });
  if (res.ok) return "ok";

  let reason = "";
  try {
    reason = (await res.json()).reason ?? "";
  } catch {
    /* no body */
  }
  if (res.status === 410 || reason === "Unregistered") return "gone";
  if (reason === "BadDeviceToken") return "wrong_server";
  if (reason === "ExpiredProviderToken") cachedJwt = null;
  console.warn(`push: ${server} ${res.status} ${reason}`);
  return "error";
}

/** Tries the server the token is filed under, then the other one. */
async function deliver(t: Claim["tokens"][number], m: Message) {
  const first = await sendOne(t.token, t.env, m);
  if (first === "ok" || first === "error") return;
  if (first === "gone") {
    await rpc("push_token_update", { p_token: t.token, p_env: null });
    return;
  }
  const other = t.env === "production" ? "sandbox" : "production";
  const second = await sendOne(t.token, other, m);
  if (second === "ok") await rpc("push_token_update", { p_token: t.token, p_env: other });
  else if (second === "gone" || second === "wrong_server") {
    await rpc("push_token_update", { p_token: t.token, p_env: null });
  }
}

/* ------------------------------------------------------------------ */

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const source = body?.source;
  const id = Number(body?.id);
  if ((source !== "notifications" && source !== "messages") || !Number.isSafeInteger(id)) {
    return json({ error: "bad request" }, 400);
  }

  if (!env("APNS_PRIVATE_KEY") || !env("APNS_KEY_ID") || !env("APNS_TEAM_ID")) {
    console.warn("push: APNs secrets not set");
    return json({ skipped: "not configured" });
  }

  try {
    const claim: Claim | null = await rpc("push_claim", { p_source: source, p_id: id });
    if (!claim) return json({ skipped: true });
    const m = describe(claim);
    if (!m) return json({ skipped: "unknown kind" });
    await Promise.all(claim.tokens.map((t) => deliver(t, m).catch((e) => console.error(e))));
    return json({ sent: claim.tokens.length });
  } catch (e) {
    console.error(e);
    return json({ error: "server" }, 500);
  }
}

Deno.serve(handle);
