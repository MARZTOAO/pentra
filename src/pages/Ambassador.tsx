import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FullScreenLoader } from "../components/ui";
import { money } from "../lib/billing";
import { SITE_URL } from "../lib/platform";
import {
  getLeaderboard,
  getMyAmbassador,
  type Leaderboard,
  type MyAmbassador,
} from "../lib/ambassador";

/**
 * The Ambassador page: a creator partner's own numbers.
 *
 * Everything here comes from my_ambassador() and
 * ambassador_leaderboard() (supabase/104), which only answer for an
 * account a developer has linked to a creator code, and only ever
 * about that account's own code. Counts only — never who signed up.
 */
export default function Ambassador() {
  const [me, setMe] = useState<MyAmbassador | null | undefined>(undefined);
  const [board, setBoard] = useState<Leaderboard | null>(null);

  useEffect(() => {
    getMyAmbassador().then(setMe);
    getLeaderboard().then(setBoard);
  }, []);

  if (me === undefined) return <FullScreenLoader />;

  if (me === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-8 sm:py-10">
        <h1 className="display on-art text-2xl">Ambassador</h1>
        <p className="on-art mt-2 text-sm text-muted">
          This page is for Pentra's creator partners. If you're one and
          can't see your numbers, get in touch at support@pentra.gg.
        </p>
        <Link to="/settings" className="mt-4 inline-block text-sm font-semibold text-accent hover:underline">
          ← Settings
        </Link>
      </div>
    );
  }

  const link = `${SITE_URL}/?creator=${me.code}`;
  const pro = me.monthly + me.yearly;
  const toNext = Math.max(0, me.tier_size - me.payable);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-8">
        <h1 className="display on-art text-2xl">Ambassador</h1>
        <p className="on-art mt-1 text-sm text-muted">
          {me.creator_name} · only you can see this page.
        </p>
      </header>

      {!me.active && (
        <p className="mb-6 notch-md border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
          Your code is switched off, so new viewers can't use it. Get in
          touch at support@pentra.gg.
        </p>
      )}

      <ShareLink code={me.code} link={link} />

      <Card title="All time">
        <Stats
          items={[
            { n: me.signups, label: "Signed up with your link" },
            { n: me.signups_playing, label: "Started playing" },
            { n: pro, label: "Pro subscribers" },
            { n: me.pending, label: `In the ${me.refund_days}-day refund window` },
          ]}
        />
        <p className="mt-3 text-2xs leading-relaxed text-muted">
          "Started playing" means they played a session or made 3 friends.
          A Pro subscriber counts toward your earnings once they've stayed
          past the {me.refund_days}-day refund window. Refunds
          {me.refunded + me.disputed > 0 ? ` (${me.refunded + me.disputed} so far)` : ""} don't count.
        </p>
      </Card>

      <Card title="This month and last">
        <Stats
          items={[
            { n: me.signups_this_month, label: "Sign-ups this month" },
            { n: me.signups_last_month, label: "Sign-ups last month" },
            { n: me.pro_this_month, label: "Pro this month" },
            { n: me.pro_last_month, label: "Pro last month" },
          ]}
        />
      </Card>

      <Card title="Earnings">
        <Stats
          items={[
            { n: money(me.earned_cents), label: "Earned" },
            { n: money(me.paid_cents), label: "Paid to you" },
            { n: money(me.owed_cents), label: "Owed", accent: me.owed_cents > 0 },
            { n: me.payable, label: "Counted subscribers" },
          ]}
        />
        <p className="mt-3 text-2xs leading-relaxed text-muted">
          You earn {money(me.rates.monthly)} for each monthly and{" "}
          {money(me.rates.yearly)} for each yearly subscriber for your first{" "}
          {me.tier_size}, then {money(me.rates.monthly_after)} and{" "}
          {money(me.rates.yearly_after)}.{" "}
          {toNext > 0
            ? `${toNext} more to reach the higher rate.`
            : "You're on the higher rate."}{" "}
          Payouts go out monthly once you're owed $25 or more.
        </p>

        {me.payouts.length > 0 && (
          <div className="mt-4">
            <p className="label-wide mb-1.5 text-muted">Payouts</p>
            <div className="divide-y divide-line">
              {me.payouts.map((p, i) => (
                <div key={i} className="flex justify-between py-1.5 text-sm">
                  <span className="numeric text-muted">{new Date(p.paid_at).toLocaleDateString()}</span>
                  <span className="numeric font-semibold">{money(p.amount_cents)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {board && <Board board={board} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 notch border border-line bg-surface p-5">
      <h2 className="mb-3 label-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Stats({
  items,
}: {
  items: { n: number | string; label: string; accent?: boolean }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="notch-md border border-line bg-surface-2 px-3 py-2.5">
          <dd className={"numeric text-xl font-bold leading-tight " + (it.accent ? "text-accent" : "")}>
            {it.n}
          </dd>
          <dt className="mt-0.5 text-2xs leading-tight text-muted">{it.label}</dt>
        </div>
      ))}
    </dl>
  );
}

function ShareLink({ code, link }: { code: string; link: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setError(null);
    } catch {
      setError("Couldn't copy — select the link and copy it by hand.");
    }
  }

  return (
    <Card title="Your link">
      <p className="mb-3 text-sm text-muted">
        Viewers who sign up through this link count as yours, and it fills
        in your code <span className="numeric font-semibold text-ink">{code}</span> when
        they upgrade to Pro.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="numeric min-w-0 flex-1 truncate notch-md border border-line bg-surface-2 px-3 py-2 text-xs">
          {link}
        </code>
        <button
          type="button"
          onClick={copy}
          className="label-wide shrink-0 notch-sm bg-accent px-4 py-2 text-onaccent transition hover:bg-accent-hi"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </Card>
  );
}

function Board({ board }: { board: Leaderboard }) {
  return (
    <Card title={`Top ambassadors · ${board.month}`}>
      {board.top.length === 0 ? (
        <p className="text-sm text-muted">
          Nobody brought in a new player last month. This month's top 3
          shows here at the start of next month.
        </p>
      ) : (
        <ol className="space-y-2">
          {board.top.map((row) => (
            <li
              key={row.name}
              className={
                "flex items-center gap-3 notch-md border px-3 py-2.5 " +
                (row.me ? "border-accent bg-accent/10" : "border-line bg-surface-2")
              }
            >
              <span className="numeric w-6 text-lg font-bold text-accent">{row.place}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {row.name}
                {row.me && <span className="ml-2 text-2xs text-accent">you</span>}
              </span>
              <span className="numeric text-sm text-muted">
                {row.count} new player{row.count === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-2xs text-muted">
        Ranked by sign-ups through each link that started playing.
        {board.my_place && board.my_place > 3
          ? ` You placed #${board.my_place} with ${board.my_count}.`
          : ""}
      </p>
    </Card>
  );
}
