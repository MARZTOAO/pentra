import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AuthCard, Field, Input, Button, Alert } from "../components/ui";

/**
 * Step one of a password reset: take the address, send the email.
 * Step two is /confirm, which is where the link in that email lands.
 *
 * NO `redirectTo` IS PASSED HERE, deliberately. The recovery template in
 * supabase/email-templates builds its link out of `{{ .SiteURL }}` rather
 * than `{{ .ConfirmationURL }}`, so a redirectTo would be accepted by this
 * call and then silently ignored when the email renders — which is worse
 * than not passing one, because it looks like it works. If the template is
 * ever switched back to `.ConfirmationURL`, add it here in the same change.
 */
export default function Forgot() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const { error: sendError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
    );

    setBusy(false);

    // Rate limiting is the one failure worth showing, because the person
    // can actually do something about it. Everything else lands on the
    // same confirmation screen as a success, on purpose: saying "no
    // account with that email" hands anyone who asks a way to find out
    // who has an account here.
    if (sendError && /rate|limit|too many|seconds/i.test(sendError.message)) {
      setError("Too many attempts just now. Wait a minute and try again.");
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard title="Check your email">
        <p className="mb-2 text-center text-sm text-ink">
          If there's a Pentra account for
        </p>
        <p className="mb-5 text-center text-sm font-semibold break-all">
          {email.trim()}
        </p>
        <p className="mb-6 text-center text-sm text-muted">
          we've sent it a link to set a new password. It works once and
          expires in an hour. If it hasn't arrived in a minute or two, check
          your spam folder.
        </p>

        <p className="text-center text-sm text-muted">
          <Link to="/login" className="font-medium text-accent hover:underline">
            Back to log in
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link to set a new one"
    >
      {error && <Alert>{error}</Alert>}

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

        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send the link"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link to="/login" className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}
