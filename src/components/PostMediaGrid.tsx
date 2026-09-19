import { useEffect, useState } from "react";
import type { PostMedia } from "../lib/feed";

/**
 * The pictures on a post, and the full-size view when one is clicked.
 *
 * One attachment keeps its own shape, up to a limit — a tall screenshot
 * shouldn't push the next post off the bottom of the screen. Two or
 * more go into a grid, because varied heights side by side look like a
 * mistake rather than a layout.
 *
 * Every tile reserves its space before the file arrives, using the
 * dimensions stored with it. Without that the feed shuffles downward
 * as each picture loads, which is maddening to read.
 */
export function PostMediaGrid({ media }: { media: PostMedia[] }) {
  const [open, setOpen] = useState<number | null>(null);

  if (media.length === 0) return null;

  const single = media.length === 1;

  return (
    <>
      <div
        className={
          "mt-2.5 overflow-hidden rounded-xl border border-line " +
          (single
            ? ""
            : media.length === 2
              ? "grid grid-cols-2 gap-0.5"
              : "grid grid-cols-2 gap-0.5")
        }
      >
        {media.map((item, i) => (
          <Tile
            key={item.url}
            item={item}
            single={single}
            // Three attachments: the first one runs down the left side,
            // the other two stack beside it. Twitter's arrangement, and
            // it beats leaving a hole in the grid.
            tall={media.length === 3 && i === 0}
            onOpen={() => setOpen(i)}
          />
        ))}
      </div>

      {open !== null && (
        <Lightbox
          media={media}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function Tile({
  item,
  single,
  tall,
  onOpen,
}: {
  item: PostMedia;
  single: boolean;
  tall: boolean;
  onOpen: () => void;
}) {
  // A single picture keeps its aspect ratio, but a very tall one gets
  // reined in — anything past 4:5 would otherwise fill the screen.
  const ratio = single
    ? Math.max(item.width / item.height, 0.8)
    : tall
      ? 0.75
      : 16 / 10;

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ aspectRatio: String(ratio) }}
      className={
        "group relative block w-full overflow-hidden bg-surface-2 " +
        (tall ? "row-span-2" : "")
      }
    >
      {item.kind === "video" ? (
        <>
          <video
            src={item.url}
            autoPlay
            loop
            muted
            playsInline
            // A GIF in a feed is decoration; it shouldn't pull focus or
            // announce itself to a screen reader as a video to control.
            aria-hidden="true"
            className="h-full w-full object-cover"
          />
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
            GIF
          </span>
        </>
      ) : (
        <img
          src={item.url}
          alt={item.alt ?? ""}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
        />
      )}
    </button>
  );
}

function Lightbox({
  media,
  index,
  onIndex,
  onClose,
}: {
  media: PostMedia[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const item = media[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < media.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, media.length, onClose, onIndex]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-8"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-lg px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        Close
      </button>

      {media.length > 1 && (
        <span className="absolute left-1/2 top-4 -translate-x-1/2 text-xs text-white/60">
          {index + 1} of {media.length}
        </span>
      )}

      {index > 0 && (
        <Arrow side="left" onClick={() => onIndex(index - 1)} />
      )}

      {index < media.length - 1 && (
        <Arrow side="right" onClick={() => onIndex(index + 1)} />
      )}

      <div onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full">
        {item.kind === "video" ? (
          <video
            src={item.url}
            autoPlay
            loop
            muted
            playsInline
            controls
            className="max-h-[85vh] max-w-full rounded-lg"
          />
        ) : (
          <img
            src={item.url}
            alt={item.alt ?? ""}
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
          />
        )}
      </div>
    </div>
  );
}

function Arrow({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={side === "left" ? "Previous" : "Next"}
      className={
        "absolute top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white/80 transition hover:bg-black/70 hover:text-white " +
        (side === "left" ? "left-4" : "right-4")
      }
    >
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={side === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );
}
