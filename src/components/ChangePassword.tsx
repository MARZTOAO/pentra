import { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { MIN_PASSWORD_LENGTH } from "../lib/constants";

/**
 * Changing your password while signed in.
 *
 * The forgot-password flow covers being locked out. This covers the
 * other case: you know your password and want a different one.
 *
 * IT SIGNS OUT EVERY OTHER DEVICE. Supabase does not do this on a
 * password change - a session that was already stolen keeps working
 * afterwards, which defeats the main reason anybody changes a password
 * in a hurry. `scope: "others"` revokes the rest and leaves this one
 * alone, and fires no SIGNED_OUT event, so the person is not thrown
 * back to the login screen for doing the right thing.
 *
 * Revoking kills refresh tokens at once, but an access token already
 * issued stays valid until it expires - one hour on the default
 * setting. Hence "within the hour" rather than "immediately".
 *
 * WHY IT ASKS FOR THE CURRENT PASSWORD. Supabase will happily accept
 * updateUser({ password }) from any live session without it, and the
 * dashboard's "Require current password when updating" switch is off.
 * But a live session is exactly what someone has when they sit down at
 * an unlocked machine — and changing the password is how they'd lock
 * the real owner out. So the current password is checked here first, by
 * signing in with it. That call fails harmlessly on a wrong password
 * and leaves the existing session alone.
 */
export function ChangePassword() {
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "ok" | "partial">(null);

  function reset() {
    setCurrent("");
    setNext("");
    setAgain("");
    setError(null);
  }

  async function go() {
    if (busy) return;
    setError(null);

    const email = user?.email;
    if (!email) {
      setError("Can't tell which account this is. Try signing in again.");
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (next !== again) {
      setError("The two new passwords don't match.");
      return;
    }
    if (next === current) {
      setError("That's already your password. Pick a different one.");
      return;
    }

    setBusy(true);

    // Check the current password by using it. Supabase has no "verify
    // password" call, and this is what one would do anyway.
    const { error: checkError } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });

    if (checkError) {
      setBusy(false);
      setError(
        /rate|too many/i.test(checkError.message)
          ? "Too many attempts. Wait a minute and try again."
          : "That's not your current password.",
      );
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: next,
    });

    setBusy(false);

    if (updateError) {
      setError(
        /different from the old/i.test(updateError.message)
          ? "That's already your password. Pick a different one."
          : updateError.message,
      );
      return;
    }

    // The password is changed by this point. Anything below can fail
    // without that being untrue, so nothing here shows an error that
    // would read as "it didn't work".
    const { error: revokeError } = await supabase.auth.signOut({
      scope: "others",
    });

    reset();
    setOpen(false);
    setDone(revokeError ? "partial" : "ok");
  }

  return (
    <section className="mb-8 notch border border-line bg-surface p-5">
      <h2 className="mb-1 label-wide text-muted">Password</h2>
      <p className="mb-4 text-xs text-muted">
        Changing your password signs out every other device within the
        hour. This one stays signed in.
      </p>

      {done === "ok" && !open && (
        <p className="mb-4 notch-sm border border-ok/40 bg-ok/10 px-3 py-2.5 text-sm text-ok">
          Password changed. Every other device has been signed out.
        </p>
      )}

      {done === "partial" && !open && (
        <p className="mb-4 notch-sm border border-ok/40 bg-ok/10 px-3 py-2.5 text-sm text-ok">
          Password changed — but we couldn't sign out your other devices.
          Change it again from a working connection if that matters.
        </p>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setDone(null);
          }}
          className="notch-md border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent"
        >
          Change password
        </button>
      ) : (
        <div>
          <PasswordField
            label="Current password"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            autoFocus
          />

          <PasswordField
            label="New password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            value={next}
            onChange={setNext}
            autoComplete="new-password"
          />

          <PasswordField
            label="New password again"
            value={again}
            onChange={setAgain}
            autoComplete="new-password"
          />

          {error && <p className="mb-3 text-xs text-danger">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={go}
              disabled={busy || !current || !next || !again}
              className="notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save new password"}
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              className="notch-md border border-line px-4 py-2 text-sm text-muted transition hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PasswordField({
  label,
  hint,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder="••••••••"
        className="w-full notch-md border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
