import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import {
  checkBirthDate,
  formatBirthDate,
  getMyBirthDate,
  setBirthDate,
  todayIso,
} from "../lib/birthday";
import { SUPPORT_EMAIL } from "../lib/constants";

/**
 * Date of birth, in Settings.
 *
 * Shown only to its owner. Empty: a box to add it (the same question
 * older accounts get asked once on open). Set: the date, and how to
 * get it corrected — it's locked, because an age check you can edit
 * yourself isn't one.
 */
export function BirthDateSection() {
  const { user } = useAuth();

  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getMyBirthDate().then((d) => {
      if (!active) return;
      setSaved(d);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [user]);

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
      setJustSaved(true);
    } else if (result === "already_set") {
      setSaved(await getMyBirthDate());
    } else if (result === "too_young") {
      setRefused(true);
    } else if (result === "invalid") {
      setError("That doesn't look like a real date.");
    } else {
      setError("Couldn't save that just now. Try again in a moment.");
    }
  }

  if (!loaded) return null;

  return (
    <section className="mb-8 notch border border-line bg-surface p-5">
      <h2 className="mb-1 label-wide text-muted">Date of birth</h2>
      <p className="mb-4 text-xs text-muted">
        Private. It never appears on your profile and nobody else can see
        it. We use it for one thing: wishing you a happy birthday.
      </p>

      {saved ? (
        <>
          {justSaved && (
            <p className="mb-4 notch-sm border border-ok/40 bg-ok/10 px-3 py-2.5 text-sm text-ok">
              Saved.
            </p>
          )}
          <p className="text-sm font-medium text-ink">
            {formatBirthDate(saved)}
          </p>
          <p className="mt-2 text-xs text-muted">
            Wrong? Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            from the address on your account and we'll correct it.
          </p>
        </>
      ) : refused ? (
        <p className="text-sm text-muted">
          We couldn't add that date to your account. If you think something's
          wrong, write to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
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
            Once it's saved it can only be changed by emailing {SUPPORT_EMAIL}.
          </p>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
      )}
    </section>
  );
}
