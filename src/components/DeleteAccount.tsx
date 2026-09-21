import { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { deleteMyAccount } from "../lib/account";

/**
 * The way out.
 *
 * Deliberately awkward. It starts closed, opening it does nothing on
 * its own, and the button stays dead until the person has typed their
 * own username. None of that is security — it is the difference
 * between a decision and a misclick, on something with no undo.
 *
 * It also says plainly what goes, including the part people do not
 * think about: their posts disappear from conversations other people
 * were part of.
 */
export function DeleteAccount({ username }: { username: string | null }) {
  const { signOut } = useAuth();

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    username !== null &&
    typed.trim().toLowerCase() === username.trim().toLowerCase();

  async function go() {
    if (!ready || busy) return;

    setBusy(true);
    setError(null);

    const result = await deleteMyAccount(typed);

    if (result === "deleted") {
      // The session now points at an account that no longer exists.
      // Sign out before anything else tries to use it.
      await signOut();
      window.location.hash = "#/login";
      return;
    }

    setBusy(false);

    setError(
      result === "name_mismatch"
        ? "That doesn't match your username."
        : result === "signed_out"
          ? "You've been signed out. Sign in again to delete your account."
          : "Something went wrong. Your account has not been deleted.",
    );
  }

  return (
    <section className="mt-8 notch border border-danger/40 bg-danger/5 p-5">
      <h2 className="mb-1 label-wide text-danger">Delete account</h2>

      <p className="mb-4 text-xs text-muted">
        Permanent. There's no undo and no grace period — keeping a copy
        for a few weeks would mean not really deleting it.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="notch-md border border-danger/50 px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/10"
        >
          Delete my account
        </button>
      ) : (
        <div>
          <p className="mb-2 text-sm font-semibold">This removes:</p>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-xs text-muted">
            <li>Your profile, Top 5, game library, stats and achievements</li>
            <li>
              Everything you've posted, including comments and replies on
              other people's posts
            </li>
            <li>Your messages, and your place in every group chat</li>
            <li>
              Sessions you're hosting — anyone who joined will lose them
            </li>
            <li>Your friendships, with no way to tell anyone why</li>
          </ul>

          <p className="mb-4 text-xs text-muted">
            Your username and friend code are retired rather than freed,
            so nobody else can ever be handed them.
          </p>

          <label className="mb-3 block">
            <span className="mb-1.5 block text-sm font-medium">
              Type{" "}
              <span className="numeric text-danger">
                {username ?? "your username"}
              </span>{" "}
              to confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={username ?? ""}
              className="w-full notch-md border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none transition focus:border-danger focus:ring-2 focus:ring-danger/30"
            />
          </label>

          {error && <p className="mb-3 text-xs text-danger">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={go}
              disabled={!ready || busy}
              className="notch-md bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete my account permanently"}
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
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
