import { useEffect, useRef, useState } from "react";
import { adMediaUrl, linkDomain, recordAdEvent, type Ad } from "../lib/ads";
import { openExternal } from "../lib/platform";

/**
 * An ad in the feed — supabase/85_feed_ads.sql, lib/ads.ts.
 *
 * Shaped like a post so it sits naturally in the feed, but always
 * labelled "Sponsored" so nobody mistakes it for a player's post.
 * Clicking the picture or video (or the link under it) opens the
 * advertiser's site in the person's own browser — when there is a
 * link. An ad without one is just a sponsored post: nothing on it is
 * clickable and no clicks are counted. An ad without a picture is the
 * text alone (88).
 *
 * Counts a VIEW once it has been at least half on screen for a second
 * — once per card, so a feed refresh doesn't count it again — and a
 * CLICK each time it's clicked. Only numbers are sent; see 85.
 */
export function AdCard({ ad }: { ad: Ad }) {
  const ref = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const seen = useRef(false);
  const [onScreen, setOnScreen] = useState(false);

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

  useEffect(() => {
    const v = video.current;
    if (!v || reduceMotion) return;
    if (onScreen) v.play().catch(() => {});
    else v.pause();
  }, [onScreen, reduceMotion]);

  const link = ad.link_url;

  function open() {
    if (!link) return;
    // Open first, while the browser still treats this as the click.
    void openExternal(link);
    recordAdEvent(ad.id, "click");
  }

  const url = ad.media_path ? adMediaUrl(ad.media_path) : null;
  const domain = linkDomain(link);
  const initial = ad.sponsor.trim().charAt(0).toUpperCase() || "P";
  // The picture is a button when it leads somewhere, a plain box when
  // it doesn't — a cursor that promises a click should keep it.
  const Media = link ? "button" : "div";

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
            <Media
              {...(link ? { type: "button" as const, onClick: open, title: `Opens ${domain} in your browser` } : {})}
              className={
                "group mt-3 block w-full overflow-hidden notch-md bg-surface-2 text-left" +
                (link ? "" : " cursor-default")
              }
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
                  alt={ad.body ?? `Ad for ${ad.sponsor}`}
                  loading="lazy"
                  className={
                    "h-full w-full object-cover" +
                    (link ? " transition duration-200 group-hover:scale-[1.01]" : "")
                  }
                />
              )}
            </Media>
          )}

          {link && (
            <button
              type="button"
              onClick={open}
              className="mt-2 flex w-full items-center justify-between gap-3 text-left text-xs"
            >
              <span className="truncate text-muted">{domain}</span>
              <span className="shrink-0 font-semibold text-accent">Open ↗</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
