import { useCallback, useEffect, useRef, useState } from "react";
import {
  AD_EVERY,
  AD_UNITS,
  adMediaUrl,
  createAd,
  deleteAd,
  endAd,
  linkDomain,
  listAds,
  prepareAdMedia,
  type AdUnit,
  type DevAd,
  type PreparedAd,
} from "../lib/ads";
import { MediaError } from "../lib/media";
import { openExternal } from "../lib/platform";

/**
 * DevPanel → Ads. Make ads, watch their numbers, stop or delete them.
 * Developers only: the database refuses every call here to anyone else
 * (supabase/85_feed_ads.sql).
 */
export function DevAds() {
  const [ads, setAds] = useState<DevAd[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    listAds().then((rows) => {
      setAds(rows);
      setLoading(false);
    });
  }, []);

  useEffect(load, [load]);

  const live = ads?.filter((a) => a.live) ?? [];
  const ended = ads?.filter((a) => !a.live) ?? [];

  return (
    <div className="space-y-6">
      <NewAdForm onCreated={load} />

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="label-wide text-muted">Running now ({live.length})</h3>
          <button
            onClick={load}
            className="text-[11px] font-semibold text-muted transition hover:text-ink"
          >
            Refresh
          </button>
        </div>
        <p className="mb-3 text-[11px] text-muted">
          {live.length === 0
            ? "No ads running, so the feed shows none."
            : live.length === 1
              ? `Every ${ordinal(AD_EVERY)} item in the feed is this ad.`
              : `Every ${ordinal(AD_EVERY)} item in the feed is an ad; these ${live.length} take turns, each getting an equal share.`}
        </p>

        {loading && !ads ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : ads === null ? (
          <p className="text-sm text-danger">
            Couldn't load the ads. Has supabase/85_feed_ads.sql been run?
          </p>
        ) : (
          <div className="space-y-2">
            {live.map((a) => (
              <AdRow key={a.id} ad={a} onChanged={load} />
            ))}
          </div>
        )}
      </section>

      {ended.length > 0 && (
        <section>
          <h3 className="label-wide mb-2 text-muted">Ended ({ended.length})</h3>
          <div className="space-y-2">
            {ended.map((a) => (
              <AdRow key={a.id} ad={a} onChanged={load} />
            ))}
          </div>
        </section>
      )}

      <p className="text-[11px] leading-relaxed text-muted">
        Views count once an ad has been half on screen for a second; clicks
        count every click. Totals only — nothing records who saw or clicked.
        Only developers can see these numbers.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NewAdForm({ onCreated }: { onCreated: () => void }) {
  const [sponsor, setSponsor] = useState("Pentra");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("https://");
  const [runFor, setRunFor] = useState("7");
  const [unit, setUnit] = useState<AdUnit>("days");
  const [media, setMedia] = useState<PreparedAd | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setNote(null);
    setPreparing(true);
    try {
      setMedia(await prepareAdMedia(file));
    } catch (e) {
      setMedia(null);
      setNote({
        ok: false,
        text: e instanceof MediaError ? e.message : "Couldn't read that file.",
      });
    }
    setPreparing(false);
  }

  const n = Number(runFor);
  const linkOk = /^https?:\/\/[^\s]+\.[^\s]+$/i.test(link.trim());
  const ready = media !== null && linkOk && Number.isInteger(n) && n >= 1 && !busy && !preparing;

  async function submit() {
    if (!media || !ready) return;
    setBusy(true);
    setNote(null);
    const error = await createAd({
      sponsor: sponsor.trim(),
      body: body.trim(),
      linkUrl: link.trim(),
      runFor: n,
      unit,
      media,
    });
    setBusy(false);
    if (error) {
      setNote({ ok: false, text: error });
      return;
    }
    setNote({ ok: true, text: "Ad is live. It's in the feed from the next refresh." });
    setBody("");
    setLink("https://");
    setMedia(null);
    if (fileInput.current) fileInput.current.value = "";
    onCreated();
  }

  const base =
    "notch-sm border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted focus:border-accent";
  const field = base + " w-full";

  return (
    <section className="notch-md border border-line p-4">
      <h3 className="label-wide mb-3 text-accent">New ad</h3>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Image or video</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm"
            onChange={(e) => pick(e.target.files?.[0])}
            className="block w-full text-xs text-muted file:mr-3 file:notch-sm file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink"
          />
          <span className="mt-1 block text-[11px] text-muted">
            Pictures are shrunk to 1600px automatically. Videos: MP4 or WebM,
            up to 50MB, played silently on a loop.
          </span>
        </label>

        {preparing && <p className="text-xs text-muted">Reading the file…</p>}

        {media && (
          <div className="overflow-hidden notch-sm bg-surface-2" style={{ aspectRatio: `${media.width} / ${media.height}`, maxHeight: 220 }}>
            {media.kind === "video" ? (
              <video src={media.previewUrl} muted loop autoPlay playsInline className="h-full w-full object-contain" />
            ) : (
              <img src={media.previewUrl} alt="" className="h-full w-full object-contain" />
            )}
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-xs text-muted">Link — where a click goes</span>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://example.com"
            maxLength={2000}
            className={field}
          />
          {link.trim() !== "https://" && link.trim() !== "" && !linkOk && (
            <span className="mt-1 block text-[11px] text-danger">
              A full web address, starting with https://
            </span>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-muted">Post text (optional)</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Shown above the picture, like a post."
            className={field + " resize-none"}
          />
        </label>

        <div className="grid gap-3 min-[420px]:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Name shown on the ad</span>
            <input
              value={sponsor}
              onChange={(e) => setSponsor(e.target.value)}
              maxLength={40}
              placeholder="Pentra"
              className={field}
            />
          </label>

          <div>
            <span className="mb-1 block text-xs text-muted">Runs for</span>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                step={1}
                value={runFor}
                onChange={(e) => setRunFor(e.target.value)}
                className={base + " numeric w-20 shrink-0"}
                aria-label="How many"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as AdUnit)}
                className={base + " min-w-0 flex-1 capitalize"}
                aria-label="Days, weeks, months or years"
              >
                {AD_UNITS.map((u) => (
                  <option key={u} value={u} className="capitalize">
                    {n === 1 ? u.slice(0, -1) : u}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={!ready}
            className="notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
          >
            {busy ? "Uploading…" : "Start ad"}
          </button>
          {note && (
            <span className={"text-xs " + (note.ok ? "text-ok" : "text-danger")}>{note.text}</span>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function AdRow({ ad, onChanged }: { ad: DevAd; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const e = await action();
    setBusy(false);
    if (e) setError(e);
    else onChanged();
  }

  const ctr = ad.views > 0 ? `${((ad.clicks / ad.views) * 100).toFixed(1)}%` : "—";
  const url = adMediaUrl(ad.media_path);

  return (
    <div className={"notch-md border border-line bg-surface-2 p-3 " + (ad.live ? "" : "opacity-70")}>
      <div className="flex gap-3">
        <div className="h-16 w-24 shrink-0 overflow-hidden notch-sm bg-bg">
          {ad.media_kind === "video" ? (
            <video src={url} muted preload="metadata" className="h-full w-full object-cover" />
          ) : (
            <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{ad.sponsor}</span>
            <span
              className={
                "label-wide shrink-0 px-1.5 py-px text-[9px] " +
                (ad.live ? "bg-ok/15 text-ok" : "bg-line text-muted")
              }
            >
              {ad.live ? "Live" : "Ended"}
            </span>
          </div>
          {ad.body && <p className="truncate text-xs text-muted">{ad.body}</p>}
          <button
            type="button"
            onClick={() => void openExternal(ad.link_url)}
            className="block max-w-full truncate text-left text-xs text-accent hover:underline"
          >
            {linkDomain(ad.link_url)} ↗
          </button>
          <p className="numeric mt-0.5 text-[11px] text-muted">{timeLine(ad)}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line/60 pt-2">
        <Num label="Views" value={ad.views} today={ad.views_today} />
        <Num label="Clicks" value={ad.clicks} today={ad.clicks_today} />
        <span className="text-[11px] text-muted">
          Click rate <b className="numeric text-ink">{ctr}</b>
        </span>

        <div className="ml-auto flex items-center gap-2">
          {confirming ? (
            <>
              <span className="text-[11px] text-muted">Delete it and its numbers?</span>
              <button
                disabled={busy}
                onClick={() => run(() => deleteAd(ad.id))}
                className="notch-sm bg-danger px-2.5 py-1 text-[11px] font-semibold text-bg disabled:opacity-50"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="px-1.5 py-1 text-[11px] text-muted hover:text-ink"
              >
                Keep
              </button>
            </>
          ) : (
            <>
              {ad.live && (
                <button
                  disabled={busy}
                  onClick={() => run(() => endAd(ad.id))}
                  className="notch-sm border border-line px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:text-ink disabled:opacity-50"
                >
                  End now
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => setConfirming(true)}
                className="notch-sm border border-line px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-danger hover:text-danger disabled:opacity-50"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

function Num({ label, value, today }: { label: string; value: number; today: number }) {
  return (
    <span className="text-[11px] text-muted">
      {label} <b className="numeric text-ink">{value.toLocaleString()}</b>
      {today > 0 && <span className="numeric"> (+{today.toLocaleString()} today)</span>}
    </span>
  );
}

function timeLine(ad: DevAd): string {
  const end = new Date(ad.ends_at);
  const date = end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (!ad.live) return `Ended ${date}`;
  const ms = end.getTime() - Date.now();
  const days = Math.floor(ms / 86_400_000);
  const left =
    days >= 1
      ? `${days} day${days === 1 ? "" : "s"} left`
      : `${Math.max(1, Math.round(ms / 3_600_000))}h left`;
  return `Ends ${date} · ${left}`;
}

function ordinal(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}
