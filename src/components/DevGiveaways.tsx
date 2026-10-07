import { useCallback, useEffect, useState } from "react";
import { money } from "../lib/billing";
import {
  devAddEmailEntry,
  devDraw,
  devListEntries,
  devListGiveaways,
  devSaveGiveaway,
  devSetWinner,
  whenText,
  type DevEntry,
  type DevGiveaway,
  type GiveawayForm,
} from "../lib/giveaway";

/**
 * DevPanel → Giveaways (supabase/105).
 *
 * Set one up as a draft, write the rules, publish. While it's open it
 * shows at the top of Home and at /giveaway. After it closes: Draw,
 * check the winner on TikTok (follows, commented with 3 tags), then
 * Confirm or Skip — skipping and drawing again until there are enough
 * confirmed winners. Free email entries are added here by hand.
 */
export function DevGiveaways() {
  const [rows, setRows] = useState<DevGiveaway[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DevGiveaway | "new" | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    devListGiveaways().then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, []);

  useEffect(load, [load]);

  if (editing) {
    return (
      <Editor
        g={editing === "new" ? null : editing}
        onDone={() => {
          setEditing(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs leading-relaxed text-muted">
        Entrants type their TikTok username on the giveaway page and tick the
        rules. Bonus entries: invites made during the giveaway that start
        playing before it closes. Keep total prize value under $5,000, or New
        York and Florida need registering first. Publishing shows it to
        everyone at its start time.
      </p>

      <div className="flex items-center justify-between">
        <h3 className="label-wide text-muted">Giveaways {rows ? `(${rows.length})` : ""}</h3>
        <div className="flex gap-3">
          <button onClick={load} className="text-2xs font-semibold text-muted transition hover:text-ink">
            Refresh
          </button>
          <button
            onClick={() => setEditing("new")}
            className="notch-md bg-accent px-3 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi"
          >
            New giveaway
          </button>
        </div>
      </div>

      {loading && !rows ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows === null ? (
        <p className="text-sm text-danger">Couldn't load. Has supabase/105_giveaways.sql been run?</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">None yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((g) => (
            <Card key={g.id} g={g} onEdit={() => setEditing(g)} onChange={load} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Card({ g, onEdit, onChange }: { g: DevGiveaway; onEdit: () => void; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showEntries, setShowEntries] = useState(false);
  const [adding, setAdding] = useState(false);

  const now = Date.now();
  const closed = new Date(g.ends_at).getTime() <= now;
  const started = new Date(g.starts_at).getTime() <= now;
  const state = !g.published ? "draft" : closed ? "closed" : started ? "open" : "scheduled";
  const confirmed = g.winners.filter((w) => w.status === "confirmed").length;

  async function draw() {
    if (busy) return;
    setBusy(true);
    const err = await devDraw(g.id);
    setBusy(false);
    setStatus(err);
    onChange();
  }

  async function mark(id: number, s: "confirmed" | "skipped") {
    if (busy) return;
    setBusy(true);
    const err = await devSetWinner(id, s);
    setBusy(false);
    setStatus(err);
    onChange();
  }

  const btn =
    "notch-sm border border-line px-2 py-1 text-2xs font-semibold text-muted transition hover:text-ink disabled:opacity-40";

  return (
    <div className="notch-md border border-line p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 truncate font-semibold">{g.title}</span>
        <span className="notch-sm border border-line px-1.5 text-3xs uppercase text-muted">{state}</span>
      </div>
      <p className="mt-1 text-xs text-muted">{g.prize}</p>
      <p className="numeric mt-1 text-xs text-muted">
        {whenText(g.starts_at)} → {whenText(g.ends_at)} · @{g.tiktok_handle} · prizes{" "}
        {money(g.prize_value_cents)}
      </p>
      <p className="numeric mt-1 text-xs text-muted">
        {g.entrants} entrant{g.entrants === 1 ? "" : "s"} ({g.email_entrants} by email) · {g.total_entries} entries ·
        winners {confirmed}/{g.winners_count} confirmed
      </p>

      {g.winners.length > 0 && (
        <div className="mt-2 divide-y divide-line notch-md border border-line">
          {g.winners.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-2 text-xs">
              <span className="font-semibold">@{w.tiktok}</span>
              <span className="text-muted">
                {w.username ? `Pentra @${w.username}` : `${w.name ?? ""} ${w.email ?? ""}`}
              </span>
              <span className="numeric text-muted" title="This entry's entries / all entries in the draw">
                {w.weight}/{w.pool}
              </span>
              <span
                className={
                  "min-w-0 flex-1 text-right font-semibold " +
                  (w.status === "confirmed" ? "text-ok" : w.status === "skipped" ? "text-danger" : "text-accent")
                }
              >
                {w.status}
              </span>
              {w.status === "drawn" && (
                <>
                  <button onClick={() => mark(w.id, "confirmed")} disabled={busy} className={btn}>
                    Confirm
                  </button>
                  <button onClick={() => mark(w.id, "skipped")} disabled={busy} className={btn}>
                    Skip
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={onEdit} disabled={busy} className={btn}>
          Edit
        </button>
        <button
          onClick={draw}
          disabled={busy || !closed || confirmed >= g.winners_count}
          title={closed ? "Draw one winner" : "Opens once entries close"}
          className={btn}
        >
          Draw a winner
        </button>
        <button onClick={() => setAdding((v) => !v)} className={btn}>
          {adding ? "Cancel" : "Add email entry"}
        </button>
        <button onClick={() => setShowEntries((v) => !v)} className={btn}>
          {showEntries ? "Hide entrants" : "Entrants"}
        </button>
      </div>

      {status && <p className="mt-2 text-xs text-danger">{status}</p>}
      {adding && (
        <EmailEntry
          id={g.id}
          onAdded={() => {
            setAdding(false);
            onChange();
          }}
        />
      )}
      {showEntries && <Entrants id={g.id} />}
    </div>
  );
}

function EmailEntry({ id, onAdded }: { id: number; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (busy) return;
    setBusy(true);
    const err = await devAddEmailEntry(id, name, email, tiktok);
    setBusy(false);
    if (err) setError(err);
    else onAdded();
  }

  const input =
    "min-w-0 flex-1 notch-md border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={input} />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={input} />
      <input
        value={tiktok}
        onChange={(e) => setTiktok(e.target.value)}
        placeholder="TikTok username"
        className={input}
      />
      <button
        onClick={add}
        disabled={busy || !email.trim() || !tiktok.trim()}
        className="notch-md bg-accent px-3 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
      >
        Add
      </button>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  );
}

function Entrants({ id }: { id: number }) {
  const [rows, setRows] = useState<DevEntry[] | null | undefined>(undefined);

  useEffect(() => {
    devListEntries(id).then(setRows);
  }, [id]);

  if (rows === undefined) return <p className="mt-2 text-xs text-muted">Loading…</p>;
  if (rows === null) return <p className="mt-2 text-xs text-danger">Couldn't load.</p>;
  if (rows.length === 0) return <p className="mt-2 text-xs text-muted">Nobody yet.</p>;

  return (
    <div className="mt-2 max-h-72 divide-y divide-line overflow-y-auto notch-md border border-line">
      {rows.map((e) => (
        <div key={e.id} className="flex flex-wrap gap-x-3 px-2.5 py-1.5 text-xs">
          <span className="font-semibold">@{e.tiktok}</span>
          <span className="min-w-0 flex-1 truncate text-muted">
            {e.username ? `@${e.username}` : `${e.name ?? ""} ${e.email ?? ""} (email)`}
          </span>
          <span className="numeric text-muted">{e.entries}×</span>
          <span className="numeric text-muted">{new Date(e.entered_at).toLocaleDateString()}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** ISO → the value a datetime-local input wants, in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Editor({ g, onDone }: { g: DevGiveaway | null; onDone: () => void }) {
  const [f, setF] = useState<GiveawayForm>(() => ({
    title: g?.title ?? "",
    prize: g?.prize ?? "",
    prize_value_cents: g?.prize_value_cents ?? 0,
    image_url: g?.image_url ?? "",
    starts_at: g?.starts_at ?? new Date().toISOString(),
    ends_at: g?.ends_at ?? new Date(Date.now() + 14 * 86_400_000).toISOString(),
    tiktok_handle: g?.tiktok_handle ?? "",
    referral_cap: g?.referral_cap ?? 10,
    winners_count: g?.winners_count ?? 1,
    rules: g?.rules ?? "",
    published: g?.published ?? false,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof GiveawayForm>(k: K, v: GiveawayForm[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await devSaveGiveaway(g?.id ?? null, f);
    setBusy(false);
    if (typeof r === "string") setError(r);
    else onDone();
  }

  const input =
    "w-full notch-md border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";
  const label = "mb-1 block text-2xs text-muted";

  return (
    <div className="space-y-3">
      <h3 className="label-wide text-muted">{g ? "Edit giveaway" : "New giveaway"}</h3>

      <div>
        <label className={label}>Title (shown on Home)</label>
        <input value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={80} placeholder="Win GTA 6 before it's out" className={input} />
      </div>
      <div>
        <label className={label}>Prize</label>
        <input value={f.prize} onChange={(e) => set("prize", e.target.value)} maxLength={300} placeholder="3 digital copies of GTA 6 (PS5 or Xbox Series X|S)" className={input} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Total value of all prizes ($)</label>
          <input
            inputMode="decimal"
            value={f.prize_value_cents ? String(f.prize_value_cents / 100) : ""}
            onChange={(e) => set("prize_value_cents", Math.round(Number(e.target.value || 0) * 100) || 0)}
            className={input}
          />
        </div>
        <div>
          <label className={label}>TikTok to follow (without @)</label>
          <input value={f.tiktok_handle} onChange={(e) => set("tiktok_handle", e.target.value.replace(/^@/, ""))} className={input} />
        </div>
        <div>
          <label className={label}>Opens (your time)</label>
          <input
            type="datetime-local"
            value={toLocalInput(f.starts_at)}
            onChange={(e) => e.target.value && set("starts_at", new Date(e.target.value).toISOString())}
            className={input}
          />
        </div>
        <div>
          <label className={label}>Closes (your time)</label>
          <input
            type="datetime-local"
            value={toLocalInput(f.ends_at)}
            onChange={(e) => e.target.value && set("ends_at", new Date(e.target.value).toISOString())}
            className={input}
          />
        </div>
        <div>
          <label className={label}>Max bonus entries per person</label>
          <input
            inputMode="numeric"
            value={String(f.referral_cap)}
            onChange={(e) => set("referral_cap", Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            className={input}
          />
        </div>
        <div>
          <label className={label}>Number of winners</label>
          <input
            inputMode="numeric"
            value={String(f.winners_count)}
            onChange={(e) => set("winners_count", Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            className={input}
          />
        </div>
      </div>
      <div>
        <label className={label}>Picture (optional: a link to an image)</label>
        <input value={f.image_url} onChange={(e) => set("image_url", e.target.value)} className={input} />
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <label className={label}>Official rules</label>
          <button
            type="button"
            onClick={() => set("rules", rulesTemplate(f))}
            className="text-2xs font-semibold text-accent hover:underline"
          >
            Fill in from the template
          </button>
        </div>
        <textarea
          value={f.rules}
          onChange={(e) => set("rules", e.target.value)}
          rows={14}
          className={input + " font-mono text-xs"}
        />
        <p className="mt-1 text-2xs text-muted">
          The template uses the details above. Replace every [BRACKETED] part before publishing.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.published} onChange={(e) => set("published", e.target.checked)} />
        Published (shows to everyone from the opening time)
      </label>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="notch-md bg-accent px-4 py-2 text-xs font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={onDone} className="notch-md border border-line px-4 py-2 text-xs font-semibold transition hover:border-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** A starting point for the official rules. Not legal advice. */
function rulesTemplate(f: GiveawayForm): string {
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/Chicago",
      timeZoneName: "short",
    });
  const value = money(f.prize_value_cents);

  return `NO PURCHASE NECESSARY TO ENTER OR WIN. A PURCHASE OR PAYMENT OF ANY KIND WILL NOT INCREASE YOUR CHANCES OF WINNING. VOID WHERE PROHIBITED.

1. SPONSOR
${f.title} (the "Giveaway") is sponsored by [YOUR FULL NAME], [MAILING ADDRESS], operator of Pentra ("Sponsor"). This Giveaway is not sponsored, endorsed or administered by, or associated with, Apple, TikTok or Instagram.

2. ELIGIBILITY
Open to legal residents of the 50 United States and the District of Columbia who are 18 or older when they enter. The Sponsor, the Sponsor's household and immediate family are not eligible.

3. ENTRY PERIOD
The Giveaway starts ${when(f.starts_at)} and ends ${when(f.ends_at)} (the "Entry Period"). The Sponsor's clock is the official clock.

4. HOW TO ENTER
(a) Follow @${f.tiktok_handle} on TikTok; (b) comment on the Sponsor's giveaway video tagging three friends; and (c) on the Giveaway page in the Pentra app or at pentra.gg/#/giveaway, enter your TikTok username, agree to these rules and tap Enter. A free Pentra account with at least one game in its Top 5 and a date of birth on file is required for an app entry.
Free entry by email: send an email to support@pentra.gg with the subject "${f.title}", your full name, email address and TikTok username, during the Entry Period. Email entrants must also complete steps (a) and (b).
Limit one entry per person, per Pentra account and per TikTok account.

5. BONUS ENTRIES
Each person who joins Pentra with your invite link during the Entry Period, and plays a session or makes three friends on Pentra before the Entry Period ends, earns you one bonus entry, up to ${f.referral_cap} bonus entries. Accounts created to gain entries do not count. Pentra Pro gives no extra entries.

6. PRIZES
${f.prize}. ${f.winners_count} winner${f.winners_count === 1 ? "" : "s"}. Total approximate retail value of all prizes: ${value}. Prizes are awarded as described, with no cash alternative, and may not be transferred. The Sponsor may substitute a prize of equal or greater value. Winners are responsible for any taxes; a winner of prizes worth $600 or more in a year must provide a W-9 and will receive a Form 1099.

7. WINNER SELECTION AND NOTIFICATION
Winners are drawn at random from all eligible entries within 3 days after the Entry Period ends; the chance of winning depends on the number of entries received, and each entry counts once. The Sponsor checks that each drawn entrant completed every step. Winners are contacted through TikTok direct message, the Pentra app or email, and must reply within 7 days and sign a declaration of eligibility, or another winner is drawn.

8. GENERAL
The Sponsor may disqualify anyone who tampers with the entry process, uses fake accounts or breaks these rules, and may cancel or change the Giveaway if it cannot run as planned. By entering, entrants agree to these rules and the Sponsor's decisions, which are final. Winners agree the Sponsor may announce their TikTok username as a winner.

9. PRIVACY
Entry information is used to run this Giveaway and is handled under the Pentra privacy policy at pentra.gg/#/privacy.

10. WINNERS LIST
For the names of the winners, email support@pentra.gg within 30 days after the Entry Period ends.`;
}
