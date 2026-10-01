import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import {
  changeBirthDate,
  checkBirthDate,
  formatBirthDate,
  getMyBirthDateStatus,
  setBirthDate,
  todayIso,
} from "../lib/birthday";
import { SUPPORT_EMAIL } from "../lib/constants";
import { Confirm } from "./SafetyMenu";

/**
 * Date of birth, in Settings.
 *
 * Shown only to its owner. Empty: a box to add it (the same question
 * older accounts get asked once on open). Set: the date, plus ONE
 * self-service correction (supabase/81) for a typo at signup. After
 * that it's locked and support is the way to fix it — an age check you
 * can edit as often as you like isn't one.
 */
export function BirthDateSection() {
  const { user } = useAuth();

  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [canChange, setCanChange] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /** Changing: the form is open. Confirming: the last-chance dialog. */
  const [changing, setChanging] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getMyBirthDateStatus().then((s) => {
      if (!active) return;
      setSaved(s?.birthDate ?? null);
      setCanChange(s?.canChange ?? false);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [user]);

  /** First-time add, for accounts made before signup asked. */
  async function save() {
    if (busy) return;
    setError(null);

    const check = checkBirthDate(value);
    if (check === "invalid") {
      setError("That doesn't look like a real date.");
      return;
    }
    if (check === "too_young") {
      setRefused(true);
      return;
    }

    setBusy(true);
    const result = await setBirthDate(value);
    setBusy(false);

    if (result === "saved") {
      setSaved(value);
      // A date added here is the original, not a correction — the one
      // change is still there if this one was a typo too.
      setCanChange(true);
      setNotice("Saved.");
      setValue("");
    } else if (result === "already_set") {
      const s = await getMyBirthDateStatus();
      setSaved(s?.birthDate ?? null);
      setCanChange(s?.canChange ?? false);
    } else if (result === "too_young") {
      setRefused(true);
    } else if (result === "invalid") {
      setError("That doesn't look like a real date.");
    } else {
      setError("Couldn't save that just now. Try again in a moment.");
    }
  }

  /** Checks the new date before the confirmation opens. */
  function reviewChange() {
    setError(null);
    const check = checkBirthDate(value);
    if (check === "invalid") {
      setError("That doesn't look like a real date.");
      return;
    }
    if (value === saved) {
      setError("That's the date we already have.");
      return;
    }
    if (check === "too_young") {
      // Same neutral wording as a refused first-time date. Nothing is
      // stored and the change isn't used up.
      setError(
        `We can't change your date of birth to that. If something's wrong, email ${SUPPORT_EMAIL}.`,
      );
      return;
    }
    setConfirming(true);
  }

  async function applyChange() {
    setBusy(true);
    const result = await changeBirthDate(value);
    setBusy(false);
    setConfirming(false);

    if (result === "changed") {
      setSaved(value);
      setCanChange(false);
      setChanging(false);
      setValue("");
      setNotice("Updated. That was your one change.");
    } else if (result === "no_change_left") {
      setCanChange(false);
      setChanging(false);
      setError(
        `You've already used your one change. Email ${SUPPORT_EMAIL} if it's still wrong.`,
      );
    } else if (result === "same") {
      setError("That's the date we already have.");
    } else if (result === "too_young") {
      setError(
        `We can't change your date of birth to that. If something's wrong, email ${SUPPORT_EMAIL}.`,
      );
    } else if (result === "invalid") {
      setError("That doesn't look like a real date.");
    } else {
      setError("Couldn't change that just now. Try again in a moment.");
    }
  }

  if (!loaded) return null;

  const supportLink = (
    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">
      {SUPPORT_EMAIL}
    </a>
  );

  return (
    <section className="mb-8 notch border border-line bg-surface p-5">
      <h2 className="mb-1 label-wide text-muted">Date of birth</h2>
      <p className="mb-4 text-xs text-muted">
        Private. It never appears on your profile and nobody else can see
        it. We use it for one thing: wishing you a happy birthday.
      </p>

      {notice && (
        <p className="mb-4 notch-sm border border-ok/40 bg-ok/10 px-3 py-2.5 text-sm text-ok">
          {notice}
        </p>
      )}

      {saved ? (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-sm font-medium text-ink">{formatBirthDate(saved)}</p>
            {canChange && !changing && (
              <button
                type="button"
                onClick={() => {
                  setChanging(true);
                  setNotice(null);
                  setError(null);
                  setValue(saved);
                }}
                className="notch-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-accent"
              >
                Change
              </button>
            )}
          </div>

          {changing ? (
            <div className="mt-4">
              {/* The warning, before they type anything. */}
              <div className="mb-3 notch-sm border border-accent/50 bg-accent-dim px-3 py-2.5 text-sm text-accent">
                <p className="font-semibold">You can only change this once.</p>
                <p className="mt-1 text-xs leading-relaxed">
                  Make sure the new date is exactly right before you save.
                  After this change it's locked, and the only way to correct
                  it is to email {SUPPORT_EMAIL}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={value}
                  min="1900-01-01"
                  max={todayIso()}
                  onChange={(e) => setValue(e.target.value)}
                  aria-label="Correct date of birth"
                  className="notch-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 [color-scheme:dark]"
                />
                <button
                  type="button"
                  onClick={reviewChange}
                  disabled={busy || !value}
                  className="notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
                >
                  Save change
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChanging(false);
                    setError(null);
                    setValue("");
                  }}
                  className="px-3 py-2 text-sm text-muted transition hover:text-ink"
                >
                  Cancel
                </button>
              </div>
              {error && <p className="mt-2 text-xs text-danger">{error}</p>}
            </div>
          ) : (
            <>
              {error && <p className="mt-2 text-xs text-danger">{error}</p>}
              <p className="mt-2 text-xs text-muted">
                {canChange ? (
                  <>
                    Entered it wrong? You can correct it once yourself. After
                    that, email {supportLink}.
                  </>
                ) : (
                  <>
                    Wrong? Email {supportLink} from the address on your
                    account and we'll correct it.
                  </>
                )}
              </p>
            </>
          )}
        </>
      ) : refused ? (
        <p className="text-sm text-muted">
          We couldn't add that date to your account. If you think something's
          wrong, write to {supportLink}.
        </p>
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={value}
              min="1900-01-01"
              max={todayIso()}
              onChange={(e) => setValue(e.target.value)}
              aria-label="Date of birth"
              className="notch-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 [color-scheme:dark]"
            />
            <button
              type="button"
              onClick={save}
              disabled={busy || !value}
              className="notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Double-check it before you save. After that you can correct it
            once yourself; beyond that, email {SUPPORT_EMAIL}.
          </p>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
      )}

      {confirming && (
        <Confirm
          title="Change your date of birth?"
          body={`From ${formatBirthDate(saved ?? "")} to ${formatBirthDate(value)}. This is your one change — make sure it's right. After this it can only be corrected by emailing ${SUPPORT_EMAIL}.`}
          confirmLabel="Yes, change it"
          onCancel={() => setConfirming(false)}
          onConfirm={applyChange}
        />
      )}
    </section>
  );
}
