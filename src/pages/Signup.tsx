import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AuthCard, Field, Input, Button, Alert } from "../components/ui";

export default function Signup() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // When Supabase has email confirmation switched on, signUp succeeds but
  // returns no session - the account isn't usable until the link is clicked.
  // We store the address here to switch the screen into "check your inbox" mode.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanUsername = username.trim();
    const cleanEmail = email.trim();

    if (!/^[A-Za-z0-9_]{3,20}$/.test(cleanUsername)) {
      setError(
        "Username must be 3-20 characters, letters, numbers and underscores only.",
      );
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);

    // Check the username first so we fail politely instead of hitting
    // a database constraint halfway through creating the account.
    const { data: available, error: checkError } = await supabase.rpc(
      "username_available",
      { candidate: cleanUsername },
    );

    if (checkError) {
      setBusy(false);
      setError(`Could not check username: ${checkError.message}`);
      return;
    }
    if (!available) {
      setBusy(false);
      setError("That username is already taken.");
      return;
    }

    // The username is passed through as metadata. The database trigger
    // reads it when creating the matching row in `profiles`.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          username: cleanUsername,
          display_name: cleanUsername,
        },
      },
    });

    setBusy(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // No session back means Supabase is waiting on email confirmation.
    if (!data.session) {
      setPendingEmail(cleanEmail);
      return;
    }

    navigate("/", { replace: true });
  }

  if (pendingEmail) {
    return <CheckYourEmail email={pendingEmail} />;
  }

  return (
    <AuthCard title="Create your account" subtitle="Find people worth playing with">
      {error && <Alert>{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <Field label="Username" hint="This is how other players will see you.">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="nightowl_92"
            autoComplete="username"
            autoFocus
            required
          />
        </Field>

        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </Field>

        <Field label="Password" hint="At least 8 characters.">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            required
          />
        </Field>

        <Button type="submit" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}

/**
 * Shown after signup when the account still needs email confirmation.
 * Includes a resend button, because "it never arrived" is the single most
 * common support question any app with email verification gets.
 */
function CheckYourEmail({ email }: { email: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function resend() {
    setStatus("sending");
    setMessage(null);

    const { error } = await supabase.auth.resend({ type: "signup", email });

    if (error) {
      setStatus("failed");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <AuthCard title="Check your email">
      <div className="mb-5 flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
          <svg
            className="h-7 w-7 text-accent"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </div>
      </div>

      <p className="mb-2 text-center text-sm text-ink">
        We sent a verification link to
      </p>
      <p className="mb-5 text-center text-sm font-semibold break-all">{email}</p>

      <p className="mb-6 text-center text-sm text-muted">
        Click the link in that email to activate your account, then come back
        and log in. If it isn't there in a minute or two, check your spam folder.
      </p>

      {status === "sent" && <Alert kind="ok">Sent again — have another look.</Alert>}
      {status === "failed" && <Alert>{message ?? "Could not resend."}</Alert>}

      <Button
        variant="ghost"
        onClick={resend}
        disabled={status === "sending" || status === "sent"}
        className="mb-3"
      >
        {status === "sending"
          ? "Sending…"
          : status === "sent"
            ? "Email sent"
            : "Resend the email"}
      </Button>

      <p className="text-center text-sm text-muted">
        <Link to="/login" className="font-medium text-accent hover:underline">
          Back to log in
        </Link>
      </p>
    </AuthCard>
  );
}
