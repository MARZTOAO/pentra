import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { getMetricsSeries, useIsDeveloper, type DevDay, type DevSeries } from "../lib/dev";
import {
  C,
  ChartCard,
  Funnel,
  HBars,
  Sparkline,
  StackBar,
  TimeChart,
  fmt,
  fmtDay,
  groupWeeks,
  type Point,
} from "../components/Charts";
import { Numbers } from "../components/DevPanel";

/**
 * The developer metrics page — the Numbers tab, with charts.
 *
 * Its own screen (sidebar → Metrics, developers only) rather than
 * another tab in the developer dialog, because charts want width and
 * the dialog is 672px at most. Also reachable at /#/dev, so it can be
 * kept open in a browser tab of its own.
 *
 * Same rule as everything developer: the sidebar link and the check
 * below only decide what to draw. The database refuses the numbers to
 * anybody who isn't a developer (84 → dev_metrics_series).
 */

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

/** The per-day counts that get a small chart each. */
const ACTIVITY: { key: keyof DevDay; label: string; color: string }[] = [
  { key: "posts", label: "Posts", color: C.accent },
  { key: "sessions", label: "Sessions posted", color: C.accent },
  { key: "joins", label: "Session joins", color: C.accent },
  { key: "comments", label: "Comments", color: C.cyan },
  { key: "likes", label: "Likes", color: C.cyan },
  { key: "messages", label: "Messages", color: C.cyan },
  { key: "friendships", label: "New friendships", color: C.gold },
  { key: "referrals", label: "Referral signups", color: C.gold },
];

export default function DevMetrics() {
  const { user } = useAuth();
  const isDev = useIsDeveloper(user?.id);
  const [checked, setChecked] = useState(false);

  const [days, setDays] = useState(30);
  const [realOnly, setRealOnly] = useState(true);
  const [data, setData] = useState<DevSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // useIsDeveloper says false until it knows. Give it a moment before
  // calling this a closed door, or a developer sees "not for you"
  // flash past on every visit.
  useEffect(() => {
    const t = setTimeout(() => setChecked(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Click 7 days then 1 year quickly and the answers can arrive in
  // either order; only the newest request gets to draw.
  const latest = useRef(0);

  const load = useCallback(() => {
    const ask = ++latest.current;
    setLoading(true);
    setFailed(false);
    getMetricsSeries(days, realOnly).then((r) => {
      if (ask !== latest.current) return;
      setData(r);
      setFailed(r === null);
      setLoading(false);
    });
  }, [days, realOnly]);

  useEffect(() => {
    if (isDev) load();
  }, [isDev, load]);

  if (!isDev) {
    return checked ? (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="display mb-2 text-2xl">Developers only</h1>
        <p className="text-sm text-muted">
          This page is for the people who run Pentra.{" "}
          <Link to="/home" className="text-accent underline underline-offset-2">
            Back to the feed
          </Link>
        </p>
      </div>
    ) : null;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-wide mb-1 text-accent">Developer</p>
          <h1 className="display text-2xl sm:text-3xl">Metrics</h1>
          <p className="mt-1 text-sm text-muted">
            How Pentra is doing, day by day. Counts only — nothing here
            shows what any one person did.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex notch-sm border border-line bg-surface p-0.5" role="tablist" aria-label="Range">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                role="tab"
                aria-selected={days === r.days}
                onClick={() => setDays(r.days)}
                className={
                  "notch-sm px-2.5 py-1 text-xs font-semibold transition " +
                  (days === r.days ? "bg-accent text-onaccent" : "text-muted hover:text-ink")
                }
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="notch-sm border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-ink disabled:opacity-50"
          >
            {loading ? "Counting…" : "Refresh"}
          </button>
        </div>
      </header>

      {failed && !loading && (
        <p className="notch-md mb-6 border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          Couldn't read the numbers. If this is the first time opening this
          page, supabase/84_dev_metrics_charts.sql may not have been run yet.
        </p>
      )}

      {data && (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <Dashboard d={data} realOnly={realOnly} setRealOnly={setRealOnly} />
        </div>
      )}

      {!data && loading && <p className="text-sm text-muted">Counting…</p>}

      {/* Everything from the Numbers tab, for the exact figures. */}
      <section className="notch mt-8 border border-line bg-surface p-4">
        <h2 className="label-wide mb-3 text-muted">Every number, right now</h2>
        <Numbers onPage />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Dashboard({
  d,
  realOnly,
  setRealOnly,
}: {
  d: DevSeries;
  realOnly: boolean;
  setRealOnly: (v: boolean) => void;
}) {
  // Past 90 days the charts switch to one bar per week — a year of
  // daily bars is too thin to read or to point at.
  const weekly = d.days > 90;
  const series = useMemo(() => {
    const of = (k: keyof DevDay, how: "sum" | "last" | "avg" = "sum"): Point[] => {
      const daily = d.daily.map((r) => ({ day: r.day, value: r[k] as number | null }));
      return weekly ? groupWeeks(daily, how) : daily;
    };
    return { of };
  }, [d, weekly]);

  const sum = (k: keyof DevDay) => d.daily.reduce((s, r) => s + ((r[k] as number | null) ?? 0), 0);

  const last = d.daily[d.daily.length - 1];
  const first = d.daily[0];
  const accounts = last?.accounts ?? 0;
  const startAccounts = first ? first.accounts - first.signups : 0;
  const recorded = d.daily.filter((r) => r.active !== null);
  const activeToday = last?.active ?? null;
  const activeAvg = recorded.length
    ? Math.round(recorded.reduce((s, r) => s + (r.active ?? 0), 0) / recorded.length)
    : null;
  const proPct = d.tiers.pro + d.tiers.free > 0
    ? Math.round((d.tiers.pro / (d.tiers.pro + d.tiers.free)) * 100)
    : 0;
  const range = `in ${d.days} days`;

  return (
    <div className="space-y-4">
      {d.test_accounts > 0 && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={!realOnly}
            onChange={(e) => setRealOnly(!e.target.checked)}
            className="accent-[#ff7a2f]"
          />
          Include the {fmt(d.test_accounts)} seeded test accounts (@example.test)
        </label>
      )}

      {/* The headline numbers, each with its trend. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile
          label="Accounts"
          value={fmt(accounts)}
          sub={`${accounts - startAccounts >= 0 ? "+" : ""}${fmt(accounts - startAccounts)} ${range}`}
          spark={d.daily.map((r) => r.accounts)}
        />
        <Tile label="Signups" value={fmt(sum("signups"))} sub={range} spark={d.daily.map((r) => r.signups)} />
        <Tile
          label="Active today"
          value={activeToday === null ? "—" : fmt(activeToday)}
          sub={activeAvg === null ? "not recorded yet" : `avg ${fmt(activeAvg)} a day`}
          spark={d.daily.map((r) => r.active)}
          color={C.ok}
        />
        <Tile
          label="Sessions"
          value={fmt(sum("sessions"))}
          sub={`${fmt(sum("joins"))} joins ${range}`}
          spark={d.daily.map((r) => r.sessions)}
        />
        <Tile label="Messages" value={fmt(sum("messages"))} sub={range} spark={d.daily.map((r) => r.messages)} color={C.cyan} />
        <Tile
          label="Pentra Pro"
          value={fmt(d.tiers.pro)}
          sub={`${proPct}% of accounts`}
          color={C.gold}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Accounts"
          note="Accounts that still exist. A deleted account takes its history with it."
        >
          <TimeChart
            kind="area"
            weekly={weekly}
            points={series.of("accounts", "last")}
            idle={<>Now <b className="text-ink">{fmt(accounts)}</b></>}
          />
        </ChartCard>

        <ChartCard title={weekly ? "New signups per week" : "New signups per day"}>
          <TimeChart
            weekly={weekly}
            points={series.of("signups")}
            idle={<><b className="text-ink">{fmt(sum("signups"))}</b> {range}</>}
          />
        </ChartCard>
      </div>

      <ChartCard
        title={weekly ? "Daily active players · weekly average" : "Daily active players"}
        note={
          d.active_since
            ? `Recorded since ${fmtDay(d.active_since)} — earlier days can't be rebuilt. Counted by UTC day; invisible players aren't counted.`
            : "Starts counting once supabase/84 has run."
        }
      >
        <TimeChart
          kind="area"
          color={C.ok}
          weekly={weekly}
          points={series.of("active", "avg")}
          idle={
            activeToday === null ? (
              "Nothing recorded in this range yet"
            ) : (
              <>Today <b className="text-ink">{fmt(activeToday)}</b>{activeAvg !== null && <> · avg {fmt(activeAvg)}</>}</>
            )
          }
        />
      </ChartCard>

      {/* Small multiples: one chart per thing, same size, so the shapes
          can be compared at a glance. Each has its own scale — read the
          totals for size, the bars for when. */}
      <section>
        <h2 className="label-wide mb-2 mt-2 text-muted">
          Activity per {weekly ? "week" : "day"}
        </h2>
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
          {ACTIVITY.map((a) => (
            <div key={a.key} className="notch-md border border-line bg-surface p-3">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-semibold">{a.label}</span>
                <span className="numeric text-sm font-bold" style={{ color: a.color }}>
                  {fmt(sum(a.key))}
                </span>
              </div>
              <TimeChart
                compact
                height={64}
                color={a.color}
                weekly={weekly}
                points={series.of(a.key)}
                idle={range}
              />
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Where new players drop off"
          note="Everyone who has ever done each step. The biggest drop is the thing to fix first."
        >
          <Funnel
            steps={[
              { label: "Signed up", n: d.funnel.accounts },
              { label: "Picked a Top 5", n: d.funnel.top_five },
              { label: "Hosted or joined a session", n: d.funnel.played },
              { label: "Made a friend", n: d.funnel.friend },
            ]}
          />
        </ChartCard>

        <ChartCard
          title="Who's still around"
          note="Accounts older than a week, each in exactly one group."
        >
          <StackBar
            parts={[
              { label: "Active", hint: "seen in the last 7 days", n: d.health.active, color: C.ok },
              { label: "Quiet", hint: "8–30 days", n: d.health.quiet, color: C.gold },
              { label: "Gone", hint: "30+ days", n: d.health.gone, color: C.muted },
              { label: "Never came back", hint: "after day one", n: d.health.never, color: C.danger },
            ]}
          />
        </ChartCard>

        <ChartCard
          title="Did anyone come?"
          note={`Sessions that started ${range}. Host-only means nobody joined — the number to watch.`}
        >
          <StackBar
            parts={[
              { label: "Full", n: d.session_fill.full, color: C.ok },
              { label: "Some joined", n: d.session_fill.partial, color: C.accent },
              { label: "Host only", n: d.session_fill.host_only, color: C.danger },
            ]}
          />
        </ChartCard>

        <ChartCard title="Free and Pro" note="Right now. Lapsed Pro counts as free.">
          <StackBar
            parts={[
              { label: "Pentra Pro", n: d.tiers.pro, color: C.gold },
              { label: "Free", n: d.tiers.free, color: C.muted },
            ]}
          />
        </ChartCard>

        <ChartCard title="Main platform">
          <HBars items={d.platforms} color={C.cyan} />
        </ChartCard>

        <ChartCard title="Most picked in a Top 5" note="How many people have each game in their Top 5.">
          <HBars items={d.top_games} />
        </ChartCard>
      </div>

      <p className="numeric text-[11px] text-muted">
        Updated {new Date(d.generated_at).toLocaleString()} · days in {d.tz}
        {d.real_only ? " · test accounts left out" : ""}
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  spark,
  color = C.accent,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  spark?: (number | null)[];
  color?: string;
}) {
  return (
    <div className="notch-md flex flex-col border border-line bg-surface p-3">
      <span className="label-wide truncate text-[10px] text-muted">{label}</span>
      <span className="numeric mt-1 text-2xl font-bold leading-none text-ink">
        {value}
      </span>
      {sub && <span className="mt-1 truncate text-[11px] text-muted">{sub}</span>}
      <div className="mt-auto pt-2">{spark ? <Sparkline values={spark} color={color} /> : <div className="h-7" />}</div>
    </div>
  );
}
