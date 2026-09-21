import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AuthCard, Field, Input, Button, Alert } from "../components/ui";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsConfirmation(false);
    setResent(false);
    setBusy(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setBusy(false);

    if (signInError) {
      // This one is worth calling out specifically - otherwise someone who
      // never clicked the link is told their password is wrong and gives up.
      if (/not confirmed/i.test(signInError.message)) {
        setNeedsConfirmation(true);
        setError("You haven't verified this email address yet.");
        return;
      }

      // Supabase deliberately gives the same message for a wrong password
      // and an unknown email, so attackers can't discover who has an account.
      setError("Email or password is incorrect.");
      return;
    }

    navigate("/home", { replace: true });
  }

  async function resendConfirmation() {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
    });
    if (error) setError(error.message);
    else setResent(true);
  }

  return (
    <AuthCard title="Welcome back" subtitle="Log in to get back to your people">
      {error && <Alert>{error}</Alert>}
      {resent && <Alert kind="ok">Verification email sent again.</Alert>}

      {needsConfirmation && !resent && (
        <div className="mb-4">
          <Button variant="ghost" onClick={resendConfirmation} type="button">
            Resend the verification email
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            required
          />
        </Field>

        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </Field>

        <Button type="submit" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        New here?{" "}
        <Link to="/signup" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}
