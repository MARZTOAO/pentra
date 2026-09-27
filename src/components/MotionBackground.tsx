import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { findBackground } from "../lib/backgrounds";

/**
 * The moving layer of a Pentra Pro "Motion" background.
 *
 * Rendered INSIDE the element that already carries bannerStyle(), so
 * the still colour is underneath and shows through wherever the
 * animation is transparent — and is all anyone sees if the animation
 * is stopped (reduced motion) or the layer isn't rendered (not Pro).
 *
 * All the drawing is CSS: `.mb-*` in index.css. Each preset is a
 * handful of oversized layers moved with transforms, which the browser
 * composites on the GPU. Nothing is fetched.
 *
 * Cipher is the exception: its columns of digits are generated here,
 * from a fixed seed so the picture is the same on every visit and
 * identical in the picker and on the page.
 */
export function MotionBackground({ preset }: { preset: string | null | undefined }) {
  const bg = findBackground(preset);
  if (!bg?.motion) return null;

  const name = bg.key.slice("motion-".length);

  if (name === "cipher") return <Cipher />;

  const layers = LAYERS[name] ?? 0;
  if (!layers) return null;

  return (
    <div className={`mb mb-${name}`} aria-hidden="true">
      {Array.from({ length: layers }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}

/** How many `<i>` layers each preset's CSS expects. */
const LAYERS: Record<string, number> = {
  drift: 3,
  nebula: 2,
  starfall: 2,
  embers: 3,
  scan: 3,
  tide: 2,
};

/** Pixels between columns. Fixed, so the rain is as dense on a wide
 *  monitor as in a small window — spreading a set number of columns
 *  across the width stretched it. */
const CIPHER_SPACING = 22;

/**
 * Measures its own box and lays columns across it, one every
 * CIPHER_SPACING px; a wide window simply gets more of them. The height
 * goes into --mb-h so the fall animation ends just below the box
 * (translateY of the box's height), whatever size the box is: a full
 * page, the picker's preview, or a thumbnail.
 */
function Cipher() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const count = size.w ? Math.ceil(size.w / CIPHER_SPACING) + 1 : 0;

  return (
    <div
      ref={ref}
      className="mb mb-cipher"
      aria-hidden="true"
      style={{ "--mb-h": `${size.h}px` } as CSSProperties}
    >
      <u />
      {count > 0 && cipherColumns(count)}
    </div>
  );
}

function cipherColumns(count: number) {
  // A tiny deterministic generator (LCG). Not for anything that
  // matters — just so the rain looks the same every time.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const out = [];
  for (let i = 0; i < count; i++) {
    const count = 14 + Math.floor(rnd() * 14);
    let body = "";
    for (let j = 0; j < count - 1; j++) body += Math.floor(rnd() * 10) + "\n";
    const head = Math.floor(rnd() * 10);
    const style = {
      left: i * CIPHER_SPACING,
      fontSize: 12 + Math.floor(rnd() * 5),
      opacity: Number((0.45 + rnd() * 0.55).toFixed(2)),
      "--d": `${(5 + rnd() * 8).toFixed(1)}s`,
      "--s": `${(-rnd() * 12).toFixed(1)}s`,
    } as CSSProperties;
    out.push(
      <b key={i} style={style}>
        {body}
        <i>{head}</i>
      </b>,
    );
  }
  return out;
}
