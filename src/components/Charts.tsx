import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";

/**
 * Charts for the developer metrics page.
 *
 * Hand-drawn SVG rather than a chart library: these are a handful of
 * bars and lines, a library would be the biggest thing in the bundle
 * for one screen only developers ever open, and drawing them here
 * means they look like the rest of Pentra — notched cards, the same
 * orange, the same mono numbers.
 *
 * Every chart reads out the value under the pointer (or finger) in its
 * header instead of floating a tooltip, so nothing is ever clipped by
 * a notched card's edge and it works the same on a phone.
 */

// The palette is fixed (lib/themes.ts — one palette, nothing to swap),
// so the colours can be plain values. SVG presentation attributes are
// a poor place to rely on var().
export const C = {
  accent: "#ff7a2f",
  accentHi: "#ff9354",
  gold: "#f7b733",
  cyan: "#4fb3d9",
  ok: "#4ed07a",
  danger: "#ff6b6b",
  muted: "#8d939c",
  line: "#2e3239",
  surface2: "#1f2227",
};

export type Point = { day: string; value: number | null };

const nf = new Intl.NumberFormat();
export const fmt = (n: number) => nf.format(n);

/** "2026-09-29" → a date at local midnight (not UTC, which would shift a day west). */
function parseDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function fmtDay(day: string, long = false) {
  return parseDay(day).toLocaleDateString(undefined, long
    ? { weekday: "short", month: "short", day: "numeric" }
    : { month: "short", day: "numeric" });
}

/** Width of an element, kept up to date. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A round top for the y axis and evenly spaced ticks up to it. */
function niceScale(max: number, count: number) {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const stepInt = Math.max(1, step); // counts: never a tick at 0.5
  const top = Math.ceil(max / stepInt) * stepInt;
  const ticks: number[] = [];
  for (let t = 0; t <= top + 1e-9; t += stepInt) ticks.push(t);
  return { top, ticks };
}

/** Short tick labels: 1.2k, 3M. */
function short(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/* ------------------------------------------------------------------ */

/** A notched card with a title and an optional one-line note. */
export function ChartCard({
  title,
  note,
  readout,
  children,
  className = "",
}: {
  title: string;
  note?: ReactNode;
  readout?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"notch border border-line bg-surface p-4 " + className}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="label-wide text-muted">{title}</h2>
        {readout && <div className="numeric text-xs text-ink">{readout}</div>}
      </header>
      {children}
      {note && <p className="mt-3 text-[11px] leading-relaxed text-muted">{note}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One value per day, as bars or a filled line. A null value is a day
 * with nothing recorded (daily active before 84 ran): no bar, and a
 * gap in the line rather than a drop to zero.
 */
export function TimeChart({
  points,
  kind = "bar",
  color = C.accent,
  height = 170,
  compact = false,
  idle,
  unit = "",
  weekly = false,
}: {
  points: Point[];
  /** Each point is a week starting on its day (see groupWeeks). */
  weekly?: boolean;
  kind?: "bar" | "area";
  color?: string;
  height?: number;
  /** Small multiples: no axis labels, two gridlines. */
  compact?: boolean;
  /** What the readout says when nothing is under the pointer. */
  idle?: ReactNode;
  unit?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = "g" + useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const n = points.length;
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const max = values.length ? Math.max(...values) : 0;
  const { top, ticks } = niceScale(max, compact ? 2 : 3);

  const padL = compact ? 0 : 34;
  const padR = 4;
  const padT = 6;
  const padB = compact ? 2 : 20;
  const w = Math.max(0, width - padL - padR);
  const h = height - padT - padB;
  const step = n > 0 ? w / n : 0;
  const x = (i: number) => padL + step * (i + 0.5);
  const y = (v: number) => padT + h - (v / top) * h;

  function onMove(e: PointerEvent<SVGSVGElement>) {
    if (step <= 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - padL) / step);
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  // Line and area, broken at nulls.
  let line = "";
  let area = "";
  if (kind === "area") {
    let run: [number, number][] = [];
    const flush = () => {
      if (run.length === 0) return;
      const d = run.map(([px, py], k) => `${k ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
      line += d;
      area += `${d}L${run[run.length - 1][0].toFixed(1)},${padT + h}L${run[0][0].toFixed(1)},${padT + h}Z`;
      run = [];
    };
    points.forEach((p, i) => {
      if (p.value === null) flush();
      else run.push([x(i), y(p.value)]);
    });
    flush();
  }

  const barW = Math.max(1, Math.min(28, step * 0.72));
  const hp = hover !== null ? points[hover] : null;

  // Three date labels: first, middle, last. Fewer when it's narrow.
  const labelIdx = n <= 1 ? [0] : width < 260 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <div>
      <div className="numeric mb-1.5 h-4 truncate text-[11px] text-muted">
        {hp ? (
          <>
            <span className="text-ink">{weekly ? `Week of ${fmtDay(hp.day)}` : fmtDay(hp.day, true)}</span>
            {" · "}
            {hp.value === null ? (
              "not recorded"
            ) : (
              <span className="font-bold" style={{ color }}>
                {fmt(hp.value)}
                {unit}
              </span>
            )}
          </>
        ) : (
          idle
        )}
      </div>

      <div ref={ref} className="w-full">
        {width > 0 && (
          <svg
            width={width}
            height={height}
            className="block touch-pan-y select-none"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
            role="img"
          >
            <defs>
              <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Gridlines */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={padL}
                  x2={padL + w}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={C.line}
                  strokeDasharray={t === 0 ? undefined : "2 3"}
                />
                {!compact && (
                  <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={C.muted} className="numeric">
                    {short(t)}
                  </text>
                )}
              </g>
            ))}

            {/* The hovered day */}
            {hover !== null && (
              <rect x={padL + step * hover} y={padT} width={step} height={h} fill="#ffffff" opacity="0.05" />
            )}

            {kind === "bar" &&
              points.map((p, i) =>
                p.value === null || p.value === 0 ? null : (
                  <rect
                    key={p.day}
                    x={x(i) - barW / 2}
                    y={y(p.value)}
                    width={barW}
                    height={Math.max(1, padT + h - y(p.value))}
                    fill={color}
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                ),
              )}

            {kind === "area" && (
              <>
                <path d={area} fill={`url(#${gid})`} />
                <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {/* A lone point (one recorded day) has no line to draw. */}
                {points.map((p, i) =>
                  p.value !== null &&
                  (points[i - 1]?.value ?? null) === null &&
                  (points[i + 1]?.value ?? null) === null ? (
                    <circle key={p.day} cx={x(i)} cy={y(p.value)} r="3" fill={color} />
                  ) : null,
                )}
                {hp && hp.value !== null && (
                  <circle cx={x(hover!)} cy={y(hp.value)} r="4" fill={color} stroke="#0e0f11" strokeWidth="2" />
                )}
              </>
            )}

            {!compact &&
              labelIdx.map((i, k) => (
                <text
                  key={i}
                  x={k === 0 ? padL : k === labelIdx.length - 1 ? padL + w : x(i)}
                  y={height - 5}
                  textAnchor={k === 0 ? "start" : k === labelIdx.length - 1 ? "end" : "middle"}
                  fontSize="10"
                  fill={C.muted}
                >
                  {points[i] ? fmtDay(points[i].day) : ""}
                </text>
              ))}
          </svg>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A year of daily bars is 365 slivers. Grouped into weeks it reads.
 * `sum` for counts, `last` for running totals (accounts), `avg` for
 * daily active. The final week may be short; a week with nothing
 * recorded stays null.
 */
export function groupWeeks(points: Point[], how: "sum" | "last" | "avg"): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += 7) {
    const week = points.slice(i, i + 7);
    const vals = week.map((p) => p.value).filter((v): v is number => v !== null);
    let value: number | null = null;
    if (vals.length) {
      if (how === "sum") value = vals.reduce((a, b) => a + b, 0);
      else if (how === "last") value = vals[vals.length - 1];
      else value = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    out.push({ day: week[0].day, value });
  }
  return out;
}

/** A tiny line for a stat tile. No axes, no interaction. */
export function Sparkline({
  values,
  color = C.accent,
}: {
  values: (number | null)[];
  color?: string;
}) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <div className="h-7" />;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const span = max - min || 1;
  const n = values.length;
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    const px = (i / (n - 1)) * 100;
    const py = 26 - ((v - min) / span) * 24;
    d += `${pen ? "L" : "M"}${px.toFixed(2)},${py.toFixed(2)}`;
    pen = true;
  });
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="block h-7 w-full" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

/** Ranked horizontal bars: platforms, top games. */
export function HBars({
  items,
  color = C.accent,
}: {
  items: { label: string; n: number }[];
  color?: string;
}) {
  if (items.length === 0) return <Empty />;
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[minmax(0,7.5rem)_1fr_2.5rem] items-center gap-2 text-xs">
          <span className="truncate text-muted" title={i.label}>
            {i.label}
          </span>
          <span className="h-3 bg-surface-2">
            <span className="block h-full" style={{ width: `${(i.n / max) * 100}%`, background: color }} />
          </span>
          <span className="numeric text-right font-bold">{fmt(i.n)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */

export type Part = { label: string; n: number; color: string; hint?: string };

/** One bar split into parts that add up to a whole, with a key. */
export function StackBar({ parts }: { parts: Part[] }) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  if (total === 0) return <Empty />;
  return (
    <div>
      <div className="flex h-5 w-full gap-px overflow-hidden bg-surface-2">
        {parts.map((p) =>
          p.n === 0 ? null : (
            <div
              key={p.label}
              title={`${p.label}: ${fmt(p.n)}`}
              style={{ width: `${(p.n / total) * 100}%`, background: p.color }}
            />
          ),
        )}
      </div>
      <ul className="mt-3 space-y-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-baseline gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 translate-y-px" style={{ background: p.color }} />
            <span className="min-w-0 flex-1">
              <span className="text-ink">{p.label}</span>
              {p.hint && <span className="text-muted"> · {p.hint}</span>}
            </span>
            <span className="numeric font-bold">{fmt(p.n)}</span>
            <span className="numeric w-10 text-right text-muted">{Math.round((p.n / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Each step as a share of the first, with the drop from the step
 * before written between them — the drop is the part worth reading.
 */
export function Funnel({ steps }: { steps: { label: string; n: number }[] }) {
  const first = steps[0]?.n ?? 0;
  if (first === 0) return <Empty />;
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].n : null;
        const kept = prev ? Math.round((s.n / prev) * 100) : null;
        return (
          <li key={s.label}>
            {kept !== null && (
              <p className="numeric pl-1 text-[10px] text-muted">↓ {kept}% of the step above</p>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="relative h-7 bg-surface-2">
                <div
                  className="absolute inset-y-0 left-0"
                  style={{ width: `${(s.n / first) * 100}%`, background: i === 0 ? C.accent : C.accentHi, opacity: 1 - i * 0.15 }}
                />
                <span className="absolute inset-y-0 left-2 flex items-center truncate text-xs font-semibold text-ink [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">
                  {s.label}
                </span>
              </div>
              <span className="numeric w-24 text-right text-xs">
                <b>{fmt(s.n)}</b> <span className="text-muted">{Math.round((s.n / first) * 100)}%</span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Empty() {
  return <p className="py-4 text-center text-xs text-muted">Nothing yet.</p>;
}
