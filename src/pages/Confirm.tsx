import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { MIN_PASSWORD_LENGTH } from "../lib/constants";
import { AuthCard, Alert, Button, Field, Input } from "../components/ui";

/**
 * Where the link in a Pentra email lands.
 *
 * WHY THIS PAGE EXISTS AT ALL. Supabase's own confirmation link does the
 * verifying for you and drops the finished session into the URL as a
 * fragment — `#access_token=…`. That does not work here, twice over:
 *
 *   1. This app uses HashRouter, so the fragment is the router's. A URL
 *      arriving as `#access_token=…` is, as far as the router is
 *      concerned, a route that doesn't exist.
 *   2. `detectSessionInUrl` is off in lib/supabase.ts — correct for the
 *      desktop app, which has no redirects to read — so nothing would
 *      pick those tokens up even if the router left them alone.
 *
 * So the email links here instead, carrying a `token_hash` in the QUERY
 * string where nothing else is looking, and this page exchanges it for a
 * session with verifyOtp. Same result, no collision, and the person gets
 * a real screen instead of a silent redirect that may or may not have
 * signed them in.
 *
 * It handles password recovery as well, because that link has exactly the
 * same problem.
 */

/** The link types this page knows how to complete. */
const TYPES = ["signup", "email", "recovery", "email_change", "invite"] as const;
type ConfirmType = (typeof TYPES)[number];

function parseType(raw: string | null): ConfirmType | null {
  return TYPES.includes(raw as ConfirmType) ? (raw as ConfirmType) : null;
}

type State =
  | { kind: "working" }
  | { kind: "done"; type: ConfirmType }
  | { kind: "failed"; message: string };

export default function Confirm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "working" });

  // React runs effects twice in StrictMode, and a token hash is single
  // use — the second call would fail and overwrite a success with an
  // error. Guarded rather than relying on the effect running once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const tokenHash = params.get("token_hash");
    const type = parseType(params.get("type"));

    if (!tokenHash || !type) {
      setState({
        kind: "failed",
        message: "That link is missing something. Try the newest email we sent you.",
      });
      return;
    }

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type })
      .then(({ error }) => {
        if (error) {
          setState({ kind: "failed", message: describe(error.message) });
          return;
        }
        setState({ kind: "done", type });

        // A recovery link signs you in so you can set a new password —
        // sending you to the app instead would skip the point of it.
        if (type !== "recovery") {
          window.setTimeout(() => navigate("/home", { replace: true }), 1200);
        }
      });
  }, [params, navigate]);

  if (state.kind === "working") {
    return (
      <AuthCard title="Confirming…">
        <p className="text-center text-sm text-muted">One moment.</p>
      </AuthCard>
    );
  }

  if (state.kind === "failed") {
    return (
      <AuthCard title="That link didn't work">
        <Alert>{state.message}</Alert>
        <p className="mb-5 text-sm text-muted">
          Links expire after a while, and each one can only be used once. Signing
          in again will send you a fresh one.
        </p>
        <Link to="/login">
          <Button>Back to sign in</Button>
        </Link>
      </AuthCard>
    );
  }

  if (state.type === "recovery") {
    return <NewPassword />;
  }

  return (
    <AuthCard title="You're in">
      <Alert kind="ok">Email confirmed.</Alert>
      <p className="text-center text-sm text-muted">Taking you to Pentra…</p>
    </AuthCard>
  );
}

/**
 * Supabase's wording here is aimed at developers. These are the two
 * cases somebody clicking a link in their inbox will actually hit.
 */
function describe(raw: string): string {
  if (/expired/i.test(raw)) {
    return "That link has expired.";
  }
  if (/invalid|not found|already/i.test(raw)) {
    return "That link has already been used, or isn't valid any more.";
  }
  return raw;
}

/**
 * The second half of a password reset.
 *
 * By the time this renders, verifyOtp has already turned the emailed link
 * into a real session, which is why updateUser can set a new password
 * without asking for the old one - not knowing the old one is the entire
 * reason somebody is here.
 *
 * This used to send people to Settings, which has no password field. It
 * was a dead end.
 */
function NewPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== again) {
      setError("Those two don't match.");
      return;
    }

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) {
      setError(
        /different from the old/i.test(updateError.message)
          ? "That's already your password. Pick a different one."
          : updateError.message,
      );
      return;
    }

    setSaved(true);
    window.setTimeout(() => navigate("/home", { replace: true }), 1200);
  }

  if (saved) {
    return (
      <AuthCard title="Password changed">
        <Alert kind="ok">You're signed in with your new password.</Alert>
        <p className="text-center text-sm text-muted">Taking you to Pentra…</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      {error && <Alert>{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <Field
          label="New password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            autoFocus
            required
          />
        </Field>

        <Field label="Again, to be sure">
          <Input
            type="password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            required
          />
        </Field>

        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </AuthCard>
  );
}
