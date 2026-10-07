import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { AppShell } from "../components/AppShell";
import { SiteFooter, SiteHeader } from "../components/Site";
import { FullScreenLoader } from "../components/ui";
import { ReferralPanel } from "../components/ReferralPanel";
import {
  enterGiveaway,
  getMyEntry,
  getRules,
  timeLeft,
  useCurrentGiveaway,
  whenText,
  type Giveaway,
  type MyEntry,
  type Rules,
} from "../lib/giveaway";

/**
 * /giveaway — the giveaway that's on (supabase/105).
 *
 * Works signed out too: a link in a TikTok bio lands here on the
 * website, so a visitor sees the prize and how to enter before they
 * have an account. Signed in, it's inside the app's frame.
 */
export default function GiveawayRoute() {
  const { session, loading } = useAuth();
  if (loading) return <FullScreenLoader />;

  if (session) {
    return (
      <AppShell>
        <GiveawayPage signedIn />
      </AppShell>
    );
  }

  return (
    <div className="type-base min-h-full bg-bg text-ink">
      <SiteHeader />
      <GiveawayPage signedIn={false} />
      <SiteFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function GiveawayPage({ signedIn }: { signedIn: boolean }) {
  const g = useCurrentGiveaway();

  if (g === undefined) {
    return <p className="px-4 py-10 text-center text-sm text-muted">Loading…</p>;
  }

  if (g === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
        <h1 className="display on-art text-2xl">Giveaways</h1>
        <p className="on-art mt-2 text-sm text-muted">
          There's no giveaway running right now. The next one will show
          up here and at the top of Home.
        </p>
      </div>
    );
  }

  const ended = !g.open && new Date(g.ends_at).getTime() <= Date.now();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-6">
        <p className="label-wide on-art mb-2 text-accent">Giveaway</p>
        <h1 className="display on-art text-3xl">{g.title}</h1>
        <p className="on-art mt-2 text-sm text-muted">{g.prize}</p>
        <p className="numeric on-art mt-2 text-xs text-muted">
          {ended
            ? `Closed ${whenText(g.ends_at)}`
            : `Closes ${whenText(g.ends_at)} · ${timeLeft(g.ends_at)}`}
        </p>
      </header>

      {g.image_url && (
        <img
          src={g.image_url}
          alt=""
          className="mb-6 w-full notch border border-line object-cover"
        />
      )}

      {ended ? (
        <section className="mb-6 notch border border-line bg-surface p-5">
          <h2 className="mb-1 label-wide text-muted">Entries are closed</h2>
          <p className="text-sm text-muted">
            Winners are drawn at random and announced on TikTok at{" "}
            <span className="text-ink">@{g.tiktok_handle}</span>. Winners
            are also contacted directly.
          </p>
        </section>
      ) : (
        <>
          <HowToEnter g={g} />
          {signedIn ? <EntryBox g={g} /> : <SignedOut />}
        </>
      )}

      <p className="mt-8 text-2xs leading-relaxed text-muted">
        No purchase necessary, and Pentra Pro doesn't change your chances.
        US residents 18 and over.{" "}
        <Link to={`/giveaway/rules/${g.id}`} className="font-semibold text-accent hover:underline">
          Official rules
        </Link>
        . Apple, TikTok and Instagram are not sponsors of this giveaway and
        are not involved in it in any way.
      </p>
    </div>
  );
}

function HowToEnter({ g }: { g: Giveaway }) {
  return (
    <section className="mb-6 notch border border-line bg-surface p-5">
      <h2 className="mb-3 label-wide text-muted">How to enter</h2>
      <ol className="space-y-2 text-sm">
        <li>
          <span className="numeric mr-2 font-bold text-accent">1</span>
          Follow <span className="font-semibold">@{g.tiktok_handle}</span> on TikTok.
        </li>
        <li>
          <span className="numeric mr-2 font-bold text-accent">2</span>
          Comment on the giveaway video tagging 3 friends.
        </li>
        <li>
          <span className="numeric mr-2 font-bold text-accent">3</span>
          Enter below with your TikTok username.
        </li>
      </ol>
      {g.referral_cap > 0 && (
        <p className="mt-3 text-xs text-muted">
          Bonus: +1 entry for every friend who joins Pentra with your invite
          link and starts playing before it closes, up to {g.referral_cap} extra.
        </p>
      )}
    </section>
  );
}

function SignedOut() {
  return (
    <section className="mb-6 notch border border-accent/60 bg-accent/10 p-5">
      <p className="text-sm">You need a free Pentra account to enter.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to="/signup"
          className="label-wide notch-sm bg-accent px-4 py-2 text-onaccent transition hover:bg-accent-hi"
        >
          Sign up free
        </Link>
        <Link
          to="/login"
          className="label-wide notch-sm border border-line px-4 py-2 transition hover:border-muted"
        >
          Log in
        </Link>
      </div>
      <p className="mt-3 text-2xs text-muted">
        Once you're in, come back to this page (it's also at the top of Home).
      </p>
    </section>
  );
}

function EntryBox({ g }: { g: Giveaway }) {
  const [me, setMe] = useState<MyEntry | null | undefined>(undefined);
  const [tiktok, setTiktok] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  async function load() {
    const m = await getMyEntry(g.id);
    setMe(m);
    if (m?.tiktok) setTiktok(m.tiktok);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.id]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const problem = await enterGiveaway(g.id, tiktok, agree);
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    setEditing(false);
    load();
  }

  if (me === undefined) {
    return <p className="mb-6 text-sm text-muted">Loading your entry…</p>;
  }
  if (me === null) {
    return <p className="mb-6 text-sm text-danger">Couldn't load your entry. Try again in a moment.</p>;
  }

  if (me.entered && !editing) {
    return (
      <>
        <section className="mb-6 notch border border-accent/60 bg-accent/10 p-5">
          <h2 className="mb-1 label-wide text-accent">You're in</h2>
          <p className="text-sm">
            <span className="numeric text-2xl font-bold">{me.entries}</span>{" "}
            entr{me.entries === 1 ? "y" : "ies"}
            {me.bonus > 0 && <span className="text-muted"> (1 + {me.bonus} bonus)</span>}
          </p>
          <p className="mt-2 text-xs text-muted">
            Entered as <span className="text-ink">@{me.tiktok}</span> on TikTok.{" "}
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setAgree(true);
              }}
              className="font-semibold text-accent hover:underline"
            >
              Change
            </button>
          </p>
          <p className="mt-2 text-xs text-muted">
            Winners are checked: make sure you follow @{g.tiktok_handle} and
            left your comment, or your draw goes to someone else.
          </p>
        </section>

        {g.referral_cap > 0 && <ReferralPanel />}
      </>
    );
  }

  // What's stopping them, said plainly with a way to fix it.
  const blockers: React.ReactNode[] = [];
  if (!me.has_top5) {
    blockers.push(
      <>
        Add at least one game to your Top 5.{" "}
        <Link to="/me/edit" className="font-semibold text-accent hover:underline">
          Edit profile →
        </Link>
      </>,
    );
  }
  if (me.age === "unknown") {
    blockers.push(
      <>
        Add your date of birth.{" "}
        <Link to="/settings" className="font-semibold text-accent hover:underline">
          Settings →
        </Link>
      </>,
    );
  }
  if (me.age === "under") {
    blockers.push(<>Giveaways are for players 18 and over.</>);
  }

  return (
    <section className="mb-6 notch border border-line bg-surface p-5">
      <h2 className="mb-3 label-wide text-muted">{editing ? "Change your entry" : "Enter"}</h2>

      {blockers.length > 0 ? (
        <ul className="space-y-1.5 text-sm">
          {blockers.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="mb-1 block text-xs text-muted" htmlFor="tiktok">
            Your TikTok username
          </label>
          <div className="flex items-center gap-2">
            <span className="text-muted">@</span>
            <input
              id="tiktok"
              value={tiktok}
              onChange={(e) => setTiktok(e.target.value.replace(/^@/, "").trim())}
              placeholder="yourname"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={24}
              className="min-w-0 flex-1 notch-md border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          </div>

          <label className="mt-4 flex items-start gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I'm 18 or over, I live in the US, and I agree to the{" "}
              <Link to={`/giveaway/rules/${g.id}`} className="font-semibold text-accent hover:underline">
                official rules
              </Link>
              .
            </span>
          </label>

          {error && <p className="mt-3 text-xs text-danger">{error}</p>}

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={busy || tiktok.length < 2 || !agree}
              className="label-wide notch-sm bg-accent px-5 py-2.5 text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
            >
              {busy ? "…" : editing ? "Save" : "Enter"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="label-wide notch-sm border border-line px-4 py-2.5 transition hover:border-muted"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

/** /giveaway/rules/:id — the official rules, readable signed out. */
export function GiveawayRulesRoute() {
  const { id } = useParams();
  const [rules, setRules] = useState<Rules | null | undefined>(undefined);

  useEffect(() => {
    const n = Number(id);
    if (!Number.isFinite(n)) {
      setRules(null);
      return;
    }
    getRules(n).then(setRules);
  }, [id]);

  return (
    <div className="type-base min-h-full bg-bg text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-8 sm:px-8 sm:pt-14">
        <p className="label-wide mb-4 text-accent">Official rules</p>
        {rules === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : rules === null ? (
          <p className="text-sm text-muted">No giveaway with these rules.</p>
        ) : (
          <>
            <h1 className="display text-3xl sm:text-4xl">{rules.title}</h1>
            <p className="numeric mt-3 text-xs text-muted">
              {whenText(rules.starts_at)} to {whenText(rules.ends_at)}
            </p>
            <div className="mt-8 whitespace-pre-line text-sm leading-relaxed text-muted">
              {rules.rules}
            </div>
          </>
        )}
        <Link to="/giveaway" className="mt-10 inline-block text-sm font-semibold text-accent hover:underline">
          ← Back to the giveaway
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
