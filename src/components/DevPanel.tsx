import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  addTester,
  amIDeveloper,
  buildInfo,
  dropFlag,
  getEnvironment,
  getFlags,
  getMetrics,
  removeTester,
  setFlag,
  getReportQueue,
  getReportBacklog,
  warnUser,
  banUser,
  unbanUser,
  dismissReports,
  type ReportBacklog,
  type ReportedUser,
  getChangelogStatus,
  listChangelog,
  addChangelog,
  deleteChangelog,
  changelogIsStale,
  type ChangelogKind,
  type ChangelogStatus,
  type DevChangelogEntry,
  type DevEnvironment,
  type DevFlag,
  type DevMetrics,
} from "../lib/dev";
import { clearFlagCache } from "../lib/flags";
import { Avatar } from "./Avatar";

/**
 * The developer panel.
 *
 * Renders nothing at all unless the database says you're a developer,
 * and everything inside it fails closed for anybody else — see
 * supabase/58_developer_mode.sql. Faking the check in the console
 * gets you a panel full of errors.
 *
 * A section on Settings rather than a floating button. It started as
 * a button pinned to the bottom-left corner so it would be reachable
 * from whatever screen looked wrong — which put it directly on top of
 * Sign out. A permanent overlay has to sit somewhere, and there is no
 * corner of a small screen that is reliably empty.
 *
 * The dialog is still portalled to <body>: clip-path on the notched
 * panels clips descendants, position: fixed included, so a modal
 * rendered inside one gets cut to that panel's box.
 */
export function DevPanel() {
  const [isDev, setIsDev] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("reports");

  useEffect(() => {
    amIDeveloper().then(setIsDev);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!isDev) return null;

  return (
    <>
      <section className="notch border border-accent/40 bg-accent/5 p-5">
        <h2 className="mb-1 label-wide text-accent">Developer</h2>
        <p className="mb-4 text-xs text-muted">
          Only you can see this. The numbers behind the app, the feature
          flags, and what this build actually is.
        </p>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 notch-md border border-accent/50 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m8 9-3 3 3 3" />
            <path d="m16 9 3 3-3 3" />
            <path d="M13.5 7.5 10.5 16.5" />
          </svg>
          Open developer tools
        </button>
      </section>

      {open && <Dialog tab={tab} setTab={setTab} onClose={() => setOpen(false)} />}
    </>
  );
}

function Dialog({
  tab,
  setTab,
  onClose,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  onClose: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-3 pt-10 sm:p-6 sm:pt-16">
      <div className="flex max-h-full w-full max-w-2xl flex-col notch border border-accent/40 bg-surface">
        {/* Wraps: a fourth tab pushes "build" off the right edge at
              375px wide, so on a phone the tabs drop to their own
              line rather than being clipped. */}
          <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line px-4 py-3">
          <h2 className="label-wide text-accent">Developer</h2>

          <nav className="order-last flex w-full flex-wrap gap-1 sm:order-none sm:ml-auto sm:w-auto">
            {(["reports", "news", "numbers", "flags", "build"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  "notch-sm px-2.5 py-1 text-xs font-semibold capitalize transition " +
                  (tab === t
                    ? "bg-accent text-onaccent"
                    : "text-muted hover:text-ink")
                }
              >
                {t}
              </button>
            ))}
          </nav>

          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-1 px-2 text-lg leading-none text-muted transition hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "reports" && <Reports />}
          {tab === "news" && <News />}
          {tab === "numbers" && <Numbers />}
          {tab === "flags" && <Flags />}
          {tab === "build" && <Build />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

type Tab = "reports" | "news" | "numbers" | "flags" | "build";

/* ------------------------------------------------------------------ */

/**
 * The moderation queue.
 *
 * Reports are grouped by person, not listed one by one, because you
 * act on people. A person appears once three DIFFERENT people have
 * reported them — or immediately, from a single report, if it alleges
 * threats, sexual content, or a minor being targeted.
 *
 * Unlike the Numbers tab, this shows individual accounts and what was
 * said about them. That isn't a contradiction: a metric answers "is
 * Pentra working" and needs no names, while a report is a specific
 * accusation about a specific person and is meaningless without them.
 */
function Reports() {
  const [queue, setQueue] = useState<ReportedUser[]>([]);
  const [backlog, setBacklog] = useState<ReportBacklog | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getReportQueue(), getReportBacklog()]).then(([q, b]) => {
      setQueue(q);
      setBacklog(b);
      setLoading(false);
    });
  }, []);

  useEffect(load, [load]);

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-4">
      {queue.length === 0 ? (
        <p className="text-sm text-muted">Nothing needs you.</p>
      ) : (
        queue.map((r) => <Case key={r.user_id} r={r} onDone={load} />)
      )}

      {/* Counts, not names. Enough to tell a quiet week from a bar
          set too high. */}
      {backlog && backlog.below_threshold > 0 && (
        <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
          {backlog.below_threshold} report
          {backlog.below_threshold === 1 ? " is" : "s are"} below the
          threshold and not shown. A person appears here once three
          different people report them, or straight away for threats,
          sexual content, or a minor being targeted.
        </p>
      )}
    </div>
  );
}

function Case({ r, onDone }: { r: ReportedUser; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [days, setDays] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const banned = r.banned_until !== null && new Date(r.banned_until) > new Date();

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setProblem(null);
    const result = await fn();
    setBusy(false);
    if (result === "warned" || result === "banned" ||
        result === "unbanned" || result === "dismissed") {
      onDone();
    } else {
      setProblem(result);
    }
  }

  return (
    <div
      className={
        "notch-md border p-3 " +
        (r.severe ? "border-danger/50 bg-danger/5" : "border-line")
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Avatar of={r} size={32} className="shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {r.display_name || r.username}
          </p>
          <p className="truncate text-xs text-muted">@{r.username}</p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {r.severe && (
            <span className="notch-sm bg-danger px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Severe
            </span>
          )}
          {banned && (
            <span className="notch-sm border border-danger/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">
              Banned
            </span>
          )}
          {r.warn_count > 0 && (
            <span className="notch-sm border border-accent/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
              {r.warn_count} warning{r.warn_count === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <p className="mb-2 text-xs text-muted">
        <span className="numeric font-bold text-ink">{r.reporters}</span>{" "}
        {r.reporters === 1 ? "person" : "people"} ·{" "}
        <span className="numeric font-bold text-ink">{r.reports}</span>{" "}
        report{r.reports === 1 ? "" : "s"} · {r.reasons.join(", ")}
      </p>

      {r.details.length > 0 && (
        <div className="mb-3 space-y-1">
          {r.details.slice(0, 5).map((d, i) => (
            <p
              key={i}
              className="break-words notch-sm border border-line bg-surface-2 px-2 py-1 text-xs leading-relaxed text-muted"
            >
              {d}
            </p>
          ))}
        </div>
      )}

      {r.last_action && (
        <p className="mb-2 text-[11px] text-muted">
          Last action: {r.last_action}
          {r.last_action_at &&
            ` · ${new Date(r.last_action_at).toLocaleDateString()}`}
        </p>
      )}

      {banned ? (
        <button
          onClick={() => run(() => unbanUser(r.username))}
          disabled={busy}
          className="notch-md border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-ink disabled:opacity-40"
        >
          Unban — restores their account and everything they posted
        </button>
      ) : (
        <>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="What they need to stop doing. They'll see this."
            className="mb-2 w-full resize-none notch-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => run(() => warnUser(r.username, note))}
              disabled={busy || !note.trim()}
              title={!note.trim() ? "Say what they need to stop doing" : ""}
              className="notch-md border border-accent/50 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/10 disabled:opacity-40"
            >
              Warn
            </button>

            <label className="flex items-center gap-1.5 text-xs text-muted">
              for
              <select
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="notch-md border border-line bg-surface-2 px-2 py-1 text-xs text-ink outline-none focus:border-accent"
              >
                <option value="">ever</option>
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
              </select>
            </label>

            {/* Two presses. Banning has no undo the person can reach,
                and the note becomes the record of why. */}
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                disabled={busy}
                className="notch-md border border-danger/50 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-40"
              >
                Ban…
              </button>
            ) : (
              <>
                <button
                  onClick={() =>
                    run(() =>
                      banUser(r.username, note, days ? Number(days) : null),
                    )
                  }
                  disabled={busy}
                  className="notch-md bg-danger px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? "…" : `Confirm ban ${days ? `(${days}d)` : "(forever)"}`}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="text-xs text-muted transition hover:text-ink"
                >
                  Cancel
                </button>
              </>
            )}

            <button
              onClick={() => run(() => dismissReports(r.username, note || null))}
              disabled={busy}
              className="ml-auto text-xs text-muted transition hover:text-ink disabled:opacity-40"
            >
              Dismiss
            </button>
          </div>
        </>
      )}

      {problem && <p className="mt-2 text-xs text-danger">{problem}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * What's New, written here instead of in a migration.
 *
 * Every entry used to need a SQL file, a deploy and somebody
 * remembering, which is why the changelog quietly stopped being true.
 * Now it's a box.
 *
 * It still needs a sentence from a person — nothing can work out that
 * a function rewrite means "game search that forgives" — but writing
 * one takes seconds, and the nudge at the top means a release can't
 * go out unannounced without you being told.
 */
function News() {
  const [entries, setEntries] = useState<DevChangelogEntry[]>([]);
  const [status, setStatus] = useState<ChangelogStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<ChangelogKind>("feature");
  const [weight, setWeight] = useState(2);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([listChangelog(), getChangelogStatus()]).then(([e, s]) => {
      setEntries(e);
      setStatus(s);
      setLoading(false);
    });
  }, []);

  useEffect(load, [load]);

  async function add() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const result = await addChangelog(title, body, kind, weight);
    setBusy(false);

    if (result !== "added") {
      setProblem(result);
      return;
    }
    setTitle("");
    setBody("");
    load();
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  const stale = changelogIsStale(status?.newest_at ?? null);

  return (
    <div className="space-y-4">
      {stale && (
        <p className="notch-md border border-accent/50 bg-accent-dim p-3 text-xs leading-relaxed text-accent">
          This build is newer than the last thing you announced.
          Something shipped that nobody has been told about.
        </p>
      )}

      <div className="notch-md border border-line bg-surface-2 p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What changed"
          maxLength={80}
          className="mb-2 w-full notch-md border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder="Why it matters to somebody using Pentra. One or two sentences."
          className="mb-2 w-full resize-none notch-md border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ChangelogKind)}
            className="notch-md border border-line bg-surface px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
          >
            <option value="feature">Feature</option>
            <option value="improvement">Improvement</option>
            <option value="fix">Fix</option>
          </select>

          {/* Weight is what the window ranks on, so somebody back
              after a month gets the big things rather than the
              most recent ones. */}
          <select
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            className="notch-md border border-line bg-surface px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
          >
            <option value={1}>Headline</option>
            <option value={2}>Worth mentioning</option>
            <option value={3}>Footnote</option>
          </select>

          <span className="numeric text-[11px] text-muted">
            {body.length}/300
          </span>

          <button
            onClick={add}
            disabled={busy || !title.trim() || !body.trim()}
            className="ml-auto notch-md bg-accent px-3 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
          >
            {busy ? "…" : "Publish"}
          </button>
        </div>

        {problem && <p className="mt-2 text-xs text-danger">{problem}</p>}
      </div>

      {status && (
        <p className="text-[11px] text-muted">
          {status.entries} entries. Everyone who has been away since an
          entry went up sees it next time they sign in.
        </p>
      )}

      <div className="space-y-2">
        {entries.map((e) => (
          <div key={e.id} className="notch-md border border-line p-2.5">
            <div className="mb-1 flex items-baseline gap-2">
              <span
                className={
                  "notch-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide " +
                  (e.kind === "fix"
                    ? "border border-line text-muted"
                    : e.weight === 1
                      ? "bg-accent text-onaccent"
                      : "border border-accent/50 text-accent")
                }
              >
                {e.kind}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                {e.title}
              </p>
              <button
                onClick={async () => {
                  await deleteChangelog(e.id);
                  load();
                }}
                title="Remove"
                className="shrink-0 text-xs text-muted transition hover:text-danger"
              >
                ×
              </button>
            </div>
            <p className="break-words text-xs leading-relaxed text-muted">
              {e.body}
            </p>
            <p className="mt-1 text-[10px] text-muted">
              {new Date(e.shipped_at).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Numbers() {
  const [m, setM] = useState<DevMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getMetrics().then((result) => {
      setM(result);
      setLoading(false);
    });
  }, []);

  useEffect(load, [load]);

  if (loading) return <p className="text-sm text-muted">Counting…</p>;
  if (!m) return <p className="text-sm text-danger">Couldn't read the numbers.</p>;

  return (
    <div className="space-y-5">
      <Group title="Growth">
        <Stat label="Accounts" value={m.growth.accounts} />
        <Stat label="New today" value={m.growth.new_today} />
        <Stat label="New · 7d" value={m.growth.new_7d} />
        <Stat label="New · 30d" value={m.growth.new_30d} />
        <Stat label="Active · 24h" value={m.growth.active_24h} />
        <Stat label="Active · 7d" value={m.growth.active_7d} />
        <Stat label="Active · 30d" value={m.growth.active_30d} />
      </Group>

      <Group title="Retention" note="The section that decides whether this works.">
        <Stat label="Came back · 7d" value={pct(m.retention.returned_pct)} />
        <Stat label="Month-old, active" value={m.retention.month_old_still_active} />
        <Stat label="Never returned" value={m.retention.never_returned} tone="warn" />
        <Stat label="Quiet 14d+" value={m.retention.gone_quiet_14d} tone="warn" />
        <Stat label="Have a Top 5" value={m.retention.with_top_five} />
      </Group>

      <Group
        title="Engagement"
        note="Host-only sessions are the ones nobody joined — the number to watch, not the average."
      >
        <Stat label="Posts" value={m.engagement.posts} />
        <Stat label="Posts · 7d" value={m.engagement.posts_7d} />
        <Stat label="Sessions" value={m.engagement.sessions} />
        <Stat label="Sessions · 7d" value={m.engagement.sessions_7d} />
        <Stat label="Session joins" value={m.engagement.session_joins} />
        <Stat label="Avg fill" value={pct(m.engagement.avg_fill_pct)} />
        <Stat
          label="Host only"
          value={`${m.engagement.sessions_host_only}/${m.engagement.sessions_past}`}
          tone="warn"
        />
        <Stat label="Comments" value={m.engagement.comments} />
        <Stat label="Comments · 7d" value={m.engagement.comments_7d} />
        <Stat label="Likes" value={m.engagement.likes} />
        <Stat label="Messages · 7d" value={m.engagement.messages_7d} />
        <Stat label="Friendships" value={m.engagement.friendships} />
      </Group>

      <Group title="Referrals">
        <Stat label="Live codes" value={m.referrals.codes_live} />
        <Stat label="Signups" value={m.referrals.signups} />
        <Stat label="Signups · 7d" value={m.referrals.signups_7d} />
        <Stat label="Qualified" value={m.referrals.qualified} />
        <Stat label="Qualified %" value={pct(m.referrals.qualified_pct)} />
      </Group>

      <div className="flex items-center gap-3 border-t border-line pt-3">
        <button
          onClick={load}
          className="notch-md border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-ink"
        >
          Refresh
        </button>
        <span className="text-[11px] text-muted">
          {new Date(m.generated_at).toLocaleString()}
        </span>
      </div>

      {/* Said once, here, because the absence is the point. */}
      <p className="text-[11px] leading-relaxed text-muted">
        Counts only. Nothing here reads anybody's messages or shows what
        an individual is doing — that was left out on purpose, not
        forgotten.
      </p>
    </div>
  );
}

function pct(n: number | null): string {
  return n === null ? "—" : `${n}%`;
}

function Group({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-1 label-wide text-muted">{title}</h3>
      {note && <p className="mb-2 text-[11px] text-muted">{note}</p>}
      {/* One column below 360px. Two columns there leaves about 144px
          a cell, and a label like "Month-old, active" pushes its
          number clean off the right edge — measured at 320, not
          guessed. */}
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 min-[360px]:grid-cols-2 sm:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "warn";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line/50 pb-1">
      <span className="truncate text-xs text-muted">{label}</span>
      <span
        className={
          "numeric shrink-0 text-sm font-bold " +
          (tone === "warn" ? "text-accent" : "text-ink")
        }
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Flags() {
  const [flags, setFlags] = useState<DevFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newNote, setNewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getFlags().then((f) => {
      setFlags(f);
      setLoading(false);
    });
  }, []);

  useEffect(load, [load]);

  async function create() {
    const key = newKey.trim().toLowerCase();
    if (!key || busy) return;

    setBusy(true);
    const problem = await setFlag(key, newNote.trim() || null, false);
    setBusy(false);

    if (problem) {
      // The key's shape is enforced by a CHECK constraint, so a bad
      // one comes back as a constraint error rather than a sentence.
      setNote(
        problem.includes("feature_flags_key_check")
          ? "Lowercase letters, numbers and underscores. At least three characters."
          : problem,
      );
      return;
    }

    setNewKey("");
    setNewNote("");
    setNote(null);
    clearFlagCache();
    load();
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted">
        Ship the code switched off, turn it on for named people, then
        for everyone. No second deploy, and taking it back is a toggle
        rather than a rollback.
      </p>

      <div className="notch-md border border-line bg-surface-2 p-3">
        <div className="flex flex-wrap gap-2">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="voice_chat"
            spellCheck={false}
            className="min-w-0 flex-1 notch-md border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="What is it?"
            className="min-w-0 flex-[2] notch-md border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={create}
            disabled={busy || !newKey.trim()}
            className="notch-md bg-accent px-3 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
          >
            Add flag
          </button>
        </div>
        {note && <p className="mt-2 text-xs text-danger">{note}</p>}
      </div>

      {flags.length === 0 ? (
        <p className="text-sm text-muted">No flags yet.</p>
      ) : (
        flags.map((f) => <FlagRow key={f.key} flag={f} onChanged={load} />)
      )}
    </div>
  );
}

function FlagRow({ flag, onChanged }: { flag: DevFlag; onChanged: () => void }) {
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setNote(null);
    await fn();
    setBusy(false);
    clearFlagCache();
    onChanged();
  }

  return (
    <div className="notch-md border border-line p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <code className="text-sm font-bold text-accent">{flag.key}</code>

        <button
          onClick={() =>
            run(() => setFlag(flag.key, null, !flag.enabled_for_all))
          }
          disabled={busy}
          className={
            "notch-sm px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide transition disabled:opacity-40 " +
            (flag.enabled_for_all
              ? "bg-ok text-bg"
              : "border border-line text-muted hover:text-ink")
          }
        >
          {flag.enabled_for_all ? "Everyone" : "Testers only"}
        </button>

        <button
          onClick={() => run(() => dropFlag(flag.key))}
          disabled={busy}
          className="ml-auto text-[11px] text-muted transition hover:text-danger disabled:opacity-40"
        >
          Delete
        </button>
      </div>

      {flag.description && (
        <p className="mb-2 text-xs text-muted">{flag.description}</p>
      )}

      <div className="mb-2 flex flex-wrap gap-1.5">
        {flag.testers.length === 0 ? (
          <span className="text-xs text-muted">Nobody yet.</span>
        ) : (
          flag.testers.map((t) => (
            <button
              key={t}
              onClick={() =>
                run(async () => {
                  await removeTester(flag.key, t);
                })
              }
              disabled={busy}
              title={`Remove ${t}`}
              className="notch-sm border border-line px-2 py-0.5 text-xs transition hover:border-danger hover:text-danger disabled:opacity-40"
            >
              {t} ×
            </button>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={who}
          onChange={(e) => setWho(e.target.value)}
          placeholder="username"
          spellCheck={false}
          className="min-w-0 flex-1 notch-md border border-line bg-surface-2 px-2.5 py-1 text-xs outline-none focus:border-accent"
        />
        <button
          onClick={async () => {
            if (!who.trim()) return;
            setBusy(true);
            setNote(null);
            const result = await addTester(flag.key, who);
            setBusy(false);

            if (result === "added") {
              setWho("");
              clearFlagCache();
              onChanged();
            } else {
              setNote(result);
            }
          }}
          disabled={busy || !who.trim()}
          className="notch-md border border-accent/50 px-3 py-1 text-xs font-semibold text-accent transition hover:bg-accent/10 disabled:opacity-40"
        >
          Add tester
        </button>
      </div>

      {note && <p className="mt-1.5 text-xs text-danger">{note}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Build() {
  const [env, setEnv] = useState<DevEnvironment | null>(null);
  const b = buildInfo();

  useEffect(() => {
    getEnvironment().then(setEnv);
  }, []);

  return (
    <div className="space-y-5">
      <Group title="This build">
        <Stat label="Environment" value={b.env} />
        <Stat label="Mode" value={b.mode} />
        <Stat label="Branch" value={b.branch} />
        <Stat label="Commit" value={b.commit.slice(0, 7)} />
        <Stat label="Built" value={b.builtAt} />
      </Group>

      {env && (
        <Group title="Database">
          <Stat label="Name" value={env.database} />
          <Stat label="Tables" value={env.tables} />
          <Stat label="Functions" value={env.functions} />
          <Stat label="Timezone" value={env.timezone} />
          <Stat
            label="Oldest account"
            value={
              env.oldest_account
                ? new Date(env.oldest_account).toLocaleDateString()
                : "—"
            }
          />
        </Group>
      )}

      {env && (
        <p className="break-words text-[11px] leading-relaxed text-muted">
          {env.postgres}
        </p>
      )}
    </div>
  );
}
