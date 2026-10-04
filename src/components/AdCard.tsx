import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adMediaUrl, linkDomain, recordAdEvent, type Ad } from "../lib/ads";
import { openExternal } from "../lib/platform";

/**
 * An ad in the feed — supabase/85_feed_ads.sql, lib/ads.ts.
 *
 * Shaped like a post so it sits naturally in the feed, but always
 * labelled "Sponsored" so nobody mistakes it for a player's post.
 *
 * Clicking the picture or video opens it large (MARZ, 2026-10-03:
 * "clicking on them to open up the image larger on screen or open up
 * the video in a larger player"), with an × to back out. The
 * advertiser's site is reached through a Visit button — on the card
 * and again in the large view — and only when the ad has a link. An
 * ad without one is a sponsored post with a picture you can still
 * look at; an ad without a picture is the text alone (88).
 *
 * Counts a VIEW once it has been at least half on screen for a second
 * — once per card, so a feed refresh doesn't count it again — and a
 * CLICK each time Visit is pressed. Opening the picture large is not
 * a click; nothing left Pentra. Only numbers are sent; see 85.
 */
export function AdCard({ ad }: { ad: Ad }) {
  const ref = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const seen = useRef(false);
  const [onScreen, setOnScreen] = useState(false);
  const [open, setOpen] = useState(false);

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // One observer does both jobs: the view count, and pausing a video
  // that has scrolled away so it isn't burning battery off-screen.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const io = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
        setOnScreen(visible);
        if (visible && !seen.current && timer === null) {
          timer = setTimeout(() => {
            seen.current = true;
            recordAdEvent(ad.id, "view");
          }, 1000);
        } else if (!visible && timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0, 0.5] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer !== null) clearTimeout(timer);
    };
  }, [ad.id]);

  // The small preview plays silently while on screen, and stops while
  // the big player is up so two copies aren't running at once.
  useEffect(() => {
    const v = video.current;
    if (!v || reduceMotion) return;
    if (onScreen && !open) v.play().catch(() => {});
    else v.pause();
  }, [onScreen, open, reduceMotion]);

  const link = ad.link_url;

  function visit() {
    if (!link) return;
    // Open first, while the browser still treats this as the click.
    void openExternal(link);
    recordAdEvent(ad.id, "click");
  }

  const url = ad.media_path ? adMediaUrl(ad.media_path) : null;
  const domain = linkDomain(link);
  const initial = ad.sponsor.trim().charAt(0).toUpperCase() || "P";
  const alt = ad.body ?? `Ad for ${ad.sponsor}`;

  return (
    <article ref={ref} className="notch border border-line bg-surface p-4" aria-label={`Sponsored: ${ad.sponsor}`}>
      <div className="flex gap-3">
        <div className="notch-sm flex h-10 w-10 shrink-0 items-center justify-center bg-accent-dim text-sm font-bold text-accent">
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{ad.sponsor}</span>
            <span className="label-wide shrink-0 border border-line px-1.5 py-px text-4xs text-muted">
              Sponsored
            </span>
          </div>

          {ad.body && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">{ad.body}</p>
          )}

          {/* Sized from the stored width and height, so the space is
              reserved before the file arrives and the feed doesn't jump. */}
          {url && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              title={ad.media_kind === "video" ? "Open the video" : "Open the picture"}
              className="group relative mt-3 block w-full cursor-zoom-in overflow-hidden notch-md bg-surface-2 text-left"
              style={{ aspectRatio: `${ad.width ?? 16} / ${ad.height ?? 9}`, maxHeight: 520 }}
            >
              {ad.media_kind === "video" ? (
                <video
                  ref={video}
                  src={url}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="pointer-events-none h-full w-full object-cover"
                />
              ) : (
                <img
                  src={url}
                  alt={alt}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.01]"
                />
              )}
              <span className="pointer-events-none absolute bottom-2 right-2 notch-sm bg-black/60 px-2 py-1 text-3xs font-semibold text-white/90 opacity-0 transition group-hover:opacity-100">
                {ad.media_kind === "video" ? "Play large" : "View large"}
              </span>
            </button>
          )}

          {link && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="truncate text-xs text-muted">{domain}</span>
              <VisitButton domain={domain} onClick={visit} />
            </div>
          )}
        </div>
      </div>

      {open && url && (
        <AdLightbox
          ad={ad}
          url={url}
          alt={alt}
          domain={domain}
          onVisit={link ? visit : null}
          onClose={() => setOpen(false)}
        />
      )}
    </article>
  );
}

function VisitButton({
  domain,
  onClick,
  large = false,
}: {
  domain: string | null;
  onClick: () => void;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={domain ? `Opens ${domain} in your browser` : undefined}
      className={
        "inline-flex shrink-0 items-center gap-1.5 notch-md bg-accent font-semibold text-onaccent transition hover:bg-accent-hi " +
        (large ? "px-5 py-2.5 text-sm" : "px-3 py-1.5 text-xs")
      }
    >
      Visit
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 17 17 7M9 7h8v8" />
      </svg>
    </button>
  );
}

/**
 * The large view. Portalled to <body>: a full-screen overlay must not
 * be a descendant of anything notched, since clip-path clips every
 * descendant, fixed ones included. The × top-right, the Escape key
 * and a click on the dark backdrop all close it; a click on the
 * picture, the player or the Visit bar does not.
 */
function AdLightbox({
  ad,
  url,
  alt,
  domain,
  onVisit,
  onClose,
}: {
  ad: Ad;
  url: string;
  alt: string;
  domain: string | null;
  onVisit: (() => void) | null;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-3 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Sponsored by ${ad.sponsor}`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center notch-md bg-black/50 text-white/80 transition hover:bg-white/15 hover:text-white sm:right-4 sm:top-4"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-5xl flex-col items-center"
      >
        {ad.media_kind === "video" ? (
          // Sound on: the person asked for the big player, so this is
          // the one place an ad is allowed to be heard.
          <video
            src={url}
            autoPlay
            loop
            playsInline
            controls
            className="max-h-[80vh] w-auto max-w-full notch-md bg-black"
          />
        ) : (
          <img src={url} alt={alt} className="max-h-[80vh] w-auto max-w-full notch-md object-contain" />
        )}

        <div className="mt-3 flex w-full max-w-full items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-white">{ad.sponsor}</span>
              <span className="label-wide shrink-0 border border-white/25 px-1.5 py-px text-4xs text-white/60">
                Sponsored
              </span>
            </div>
            {domain && <p className="truncate text-xs text-white/60">{domain}</p>}
          </div>
          {onVisit && <VisitButton domain={domain} onClick={onVisit} large />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
