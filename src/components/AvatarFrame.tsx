import type { CSSProperties, ReactNode } from "react";
import { FRAME_SCALE, findFrame } from "../lib/frames";

/**
 * Draws one avatar frame around a circular avatar of `size` px.
 *
 * Absolutely positioned and centred on the avatar; the parent (Avatar)
 * is `relative`. The frame box is FRAME_SCALE × the avatar, so a 96px
 * avatar gets a ~125px frame. Every measurement below is a fraction of
 * `size`, so a frame looks the same at 22px as at 96px.
 *
 * Frames that turn use Tailwind's `animate-spin` with their own
 * duration. index.css already stops all animation for anyone with a
 * reduced-motion setting; `motion-safe:` says the same thing in the
 * markup, so it survives a stylesheet change.
 *
 * The gradients are defined with a fixed id per frame. SVG ids are
 * shared across the whole page, and that is fine here: every copy of
 * "pf-ember" is identical, so whichever the browser resolves gives the
 * same result. The glow filters scale with the avatar, so their ids
 * carry the size.
 */
export function AvatarFrame({ frame, size }: { frame: string; size: number }) {
  const meta = findFrame(frame);
  if (!meta) return null;

  const w = size * FRAME_SCALE;
  const c = w / 2;
  const s = size;

  const style: CSSProperties = {
    width: w,
    height: w,
    left: (size - w) / 2,
    top: (size - w) / 2,
  };
  if (meta.spin) {
    style.animationDuration = `${meta.spin}s`;
    if (meta.reverse) style.animationDirection = "reverse";
  }

  return (
    <svg
      className={
        "pointer-events-none absolute" + (meta.spin ? " motion-safe:animate-spin" : "")
      }
      style={style}
      width={w}
      height={w}
      viewBox={`0 0 ${w} ${w}`}
      aria-hidden="true"
    >
      {draw(frame, s, c)}
    </svg>
  );
}

const glow = (id: string, s: number) => (
  <filter id={id} x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation={s * 0.023} result="b" />
    <feMerge>
      <feMergeNode in="b" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
);

function draw(frame: string, s: number, c: number): ReactNode {
  switch (frame) {
    case "ember": {
      const r = s / 2 + s * 0.06;
      return (
        <>
          <defs>
            <linearGradient id="pf-ember" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffd36b" />
              <stop offset="0.5" stopColor="#ff7a2f" />
              <stop offset="1" stopColor="#c2542f" />
            </linearGradient>
            {glow(`pf-ember-glow-${Math.round(s)}`, s)}
          </defs>
          <circle
            cx={c}
            cy={c}
            r={r + s * 0.03}
            fill="none"
            stroke="rgba(255,122,47,0.28)"
            strokeWidth={s * 0.09}
            filter={`url(#pf-ember-glow-${Math.round(s)})`}
          />
          <circle cx={c} cy={c} r={r} fill="none" stroke="url(#pf-ember)" strokeWidth={s * 0.045} />
        </>
      );
    }

    case "bezel": {
      const r = s / 2 + s * 0.07;
      const ticks = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const len = i % 6 === 0 ? s * 0.05 : s * 0.025;
        const r0 = r + s * 0.02;
        ticks.push(
          <line
            key={i}
            x1={c + Math.cos(a) * r0}
            y1={c + Math.sin(a) * r0}
            x2={c + Math.cos(a) * (r0 + len)}
            y2={c + Math.sin(a) * (r0 + len)}
            stroke="url(#pf-gold)"
            strokeWidth={s * 0.018}
            strokeLinecap="round"
          />,
        );
      }
      return (
        <>
          <defs>
            <linearGradient id="pf-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffe29a" />
              <stop offset="0.45" stopColor="#f7b733" />
              <stop offset="1" stopColor="#b8741a" />
            </linearGradient>
          </defs>
          <circle cx={c} cy={c} r={r} fill="none" stroke="url(#pf-gold)" strokeWidth={s * 0.03} />
          <circle
            cx={c}
            cy={c}
            r={r - s * 0.045}
            fill="none"
            stroke="rgba(247,183,51,0.45)"
            strokeWidth={s * 0.012}
          />
          {ticks}
        </>
      );
    }

    case "circuit": {
      const r = s / 2 + s * 0.07;
      const C = 2 * Math.PI * r;
      const r2 = r + s * 0.065;
      return (
        <>
          <defs>
            <linearGradient id="pf-cyber" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#16e0c8" />
              <stop offset="1" stopColor="#6d5efc" />
            </linearGradient>
          </defs>
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="url(#pf-cyber)"
            strokeWidth={s * 0.04}
            strokeDasharray={`${C * 0.19} ${C * 0.06}`}
            transform={`rotate(-100 ${c} ${c})`}
          />
          <circle
            cx={c}
            cy={c}
            r={r2}
            fill="none"
            stroke="rgba(22,224,200,0.5)"
            strokeWidth={s * 0.014}
            strokeDasharray={`${s * 0.02} ${s * 0.05}`}
          />
          {[0, 90, 180, 270].map((deg) => (
            <circle
              key={deg}
              cx={c + Math.cos((deg * Math.PI) / 180) * r2}
              cy={c + Math.sin((deg * Math.PI) / 180) * r2}
              r={s * 0.025}
              fill="#16e0c8"
            />
          ))}
        </>
      );
    }

    case "notch": {
      const R = s / 2 + s * 0.11;
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        pts.push(`${c + Math.cos(a) * R},${c + Math.sin(a) * R}`);
      }
      const points = pts.join(" ");
      return (
        <>
          <defs>
            <linearGradient id="pf-ember" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffd36b" />
              <stop offset="0.5" stopColor="#ff7a2f" />
              <stop offset="1" stopColor="#c2542f" />
            </linearGradient>
          </defs>
          <polygon
            points={points}
            fill="none"
            stroke="rgba(255,122,47,0.25)"
            strokeWidth={s * 0.12}
            transform={`translate(${c} ${c}) scale(1.08) translate(${-c} ${-c})`}
          />
          <polygon points={points} fill="none" stroke="url(#pf-ember)" strokeWidth={s * 0.04} />
        </>
      );
    }

    case "frost": {
      const r = s / 2 + s * 0.06;
      const shards = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = c + Math.cos(a) * (r + s * 0.06);
        const y = c + Math.sin(a) * (r + s * 0.06);
        const d = s * 0.05;
        shards.push(
          <path
            key={i}
            d={`M${x} ${y - d} L${x + d * 0.55} ${y} L${x} ${y + d} L${x - d * 0.55} ${y} Z`}
            fill="#fff"
            opacity="0.95"
          />,
        );
      }
      return (
        <>
          <defs>
            <linearGradient id="pf-frost" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#7cc8f0" />
            </linearGradient>
            {glow(`pf-frost-glow-${Math.round(s)}`, s)}
          </defs>
          <circle
            cx={c}
            cy={c}
            r={r + s * 0.02}
            fill="none"
            stroke="rgba(124,200,240,0.35)"
            strokeWidth={s * 0.08}
            filter={`url(#pf-frost-glow-${Math.round(s)})`}
          />
          <circle cx={c} cy={c} r={r} fill="none" stroke="url(#pf-frost)" strokeWidth={s * 0.035} />
          {shards}
        </>
      );
    }

    case "magma": {
      const r = s / 2 + s * 0.06;
      const flames = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const h = s * (0.07 + ((i * 7) % 5) * 0.02);
        const x1 = c + Math.cos(a) * r;
        const y1 = c + Math.sin(a) * r;
        const x2 = c + Math.cos(a + 0.12) * (r + h);
        const y2 = c + Math.sin(a + 0.12) * (r + h);
        const x3 = c + Math.cos(a + 0.25) * r;
        const y3 = c + Math.sin(a + 0.25) * r;
        flames.push(
          <path key={i} d={`M${x1} ${y1} Q${x2} ${y2} ${x3} ${y3}`} fill="url(#pf-magma)" opacity="0.9" />,
        );
      }
      return (
        <>
          <defs>
            <linearGradient id="pf-magma" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#ff3d1f" />
              <stop offset="0.6" stopColor="#f7a23b" />
              <stop offset="1" stopColor="#fff0a0" />
            </linearGradient>
            {glow(`pf-magma-glow-${Math.round(s)}`, s)}
          </defs>
          <g filter={`url(#pf-magma-glow-${Math.round(s)})`}>{flames}</g>
          <circle cx={c} cy={c} r={r} fill="none" stroke="url(#pf-magma)" strokeWidth={s * 0.04} />
        </>
      );
    }

    case "halo": {
      const r = s / 2 + s * 0.055;
      const id = `pf-halo-glow-${Math.round(s)}`;
      return (
        <>
          <defs>
            <linearGradient id="pf-halo" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f77ec0" />
              <stop offset="0.5" stopColor="#8b6cf6" />
              <stop offset="1" stopColor="#5ad0ff" />
            </linearGradient>
            {glow(id, s)}
          </defs>
          <circle
            cx={c}
            cy={c}
            r={r + s * 0.05}
            fill="none"
            stroke="rgba(139,108,246,0.35)"
            strokeWidth={s * 0.1}
            filter={`url(#${id})`}
          />
          <circle cx={c} cy={c} r={r + s * 0.05} fill="none" stroke="url(#pf-halo)" strokeWidth={s * 0.012} opacity="0.8" />
          <circle cx={c} cy={c} r={r} fill="none" stroke="url(#pf-halo)" strokeWidth={s * 0.035} />
        </>
      );
    }

    case "orbit": {
      const r = s / 2 + s * 0.05;
      const o1 = r + s * 0.045;
      const o2 = r + s * 0.095;
      const a1 = -0.9;
      const a2 = 2.4;
      return (
        <>
          <defs>
            <linearGradient id="pf-orbit" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#a8c6df" />
              <stop offset="1" stopColor="#4f6b8a" />
            </linearGradient>
          </defs>
          <circle cx={c} cy={c} r={r} fill="none" stroke="url(#pf-orbit)" strokeWidth={s * 0.03} />
          <circle cx={c} cy={c} r={o1} fill="none" stroke="rgba(168,198,223,0.4)" strokeWidth={s * 0.01} />
          <circle
            cx={c}
            cy={c}
            r={o2}
            fill="none"
            stroke="rgba(168,198,223,0.3)"
            strokeWidth={s * 0.01}
            transform={`rotate(0 ${c} ${c})`}
          />
          <circle cx={c + Math.cos(a1) * o1} cy={c + Math.sin(a1) * o1} r={s * 0.045} fill="#ffd36b" />
          <circle cx={c + Math.cos(a2) * o2} cy={c + Math.sin(a2) * o2} r={s * 0.03} fill="#7ce7f0" />
          <circle cx={c + Math.cos(a2 + 3.1) * o2} cy={c + Math.sin(a2 + 3.1) * o2} r={s * 0.02} fill="#e9ebee" />
        </>
      );
    }

    case "crown": {
      const r = s / 2 + s * 0.06;
      // Five peaks across the top, tallest in the middle, sitting on the ring.
      const peaks = [-0.42, -0.21, 0, 0.21, 0.42];
      const crest = peaks
        .map((off, i) => {
          const a = -Math.PI / 2 + off;
          const h = s * (i === 2 ? 0.17 : i === 1 || i === 3 ? 0.13 : 0.1);
          const base = r + s * 0.005;
          const l = a - 0.1;
          const rt = a + 0.1;
          return `M${c + Math.cos(l) * base} ${c + Math.sin(l) * base} L${c + Math.cos(a) * (base + h)} ${c + Math.sin(a) * (base + h)} L${c + Math.cos(rt) * base} ${c + Math.sin(rt) * base}`;
        })
        .join(" ");
      return (
        <>
          <defs>
            <linearGradient id="pf-crown" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#b8741a" />
              <stop offset="0.55" stopColor="#f7b733" />
              <stop offset="1" stopColor="#ffe29a" />
            </linearGradient>
          </defs>
          <circle cx={c} cy={c} r={r} fill="none" stroke="url(#pf-crown)" strokeWidth={s * 0.035} />
          <path d={crest} fill="url(#pf-crown)" stroke="url(#pf-crown)" strokeWidth={s * 0.02} strokeLinejoin="round" />
          {peaks.map((off, i) => {
            const a = -Math.PI / 2 + off;
            const h = s * (i === 2 ? 0.17 : i === 1 || i === 3 ? 0.13 : 0.1);
            return (
              <circle
                key={i}
                cx={c + Math.cos(a) * (r + s * 0.005 + h)}
                cy={c + Math.sin(a) * (r + s * 0.005 + h)}
                r={s * 0.022}
                fill={i === 2 ? "#ff7a2f" : "#ffe29a"}
              />
            );
          })}
        </>
      );
    }

    case "radar": {
      const r = s / 2 + s * 0.06;
      const C = 2 * Math.PI * r;
      const id = `pf-radar-glow-${Math.round(s)}`;
      return (
        <>
          <defs>
            <linearGradient id="pf-radar" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#4ed07a" stopOpacity="0" />
              <stop offset="1" stopColor="#4ed07a" />
            </linearGradient>
            {glow(id, s)}
          </defs>
          <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(78,208,122,0.35)" strokeWidth={s * 0.02} />
          <circle
            cx={c}
            cy={c}
            r={r + s * 0.06}
            fill="none"
            stroke="rgba(78,208,122,0.25)"
            strokeWidth={s * 0.012}
            strokeDasharray={`${s * 0.012} ${s * 0.035}`}
          />
          {/* The sweep: a quarter arc that fades in along its length. */}
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="url(#pf-radar)"
            strokeWidth={s * 0.05}
            strokeDasharray={`${C * 0.25} ${C * 0.75}`}
            transform={`rotate(-90 ${c} ${c})`}
            filter={`url(#${id})`}
          />
          <circle cx={c} cy={c - r} r={s * 0.03} fill="#4ed07a" />
        </>
      );
    }

    case "vortex": {
      const r = s / 2 + s * 0.06;
      const C = 2 * Math.PI * r;
      const arcs = [0, 1, 2].map((i) => (
        <circle
          key={i}
          cx={c}
          cy={c}
          r={r + i * s * 0.035}
          fill="none"
          stroke="url(#pf-vortex)"
          strokeWidth={s * (0.04 - i * 0.01)}
          strokeDasharray={`${C * 0.28} ${C * 0.22}`}
          strokeLinecap="round"
          transform={`rotate(${i * 55 - 90} ${c} ${c})`}
          opacity={1 - i * 0.25}
        />
      ));
      return (
        <>
          <defs>
            <linearGradient id="pf-vortex" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#6d5efc" />
              <stop offset="0.5" stopColor="#b968c7" />
              <stop offset="1" stopColor="#35c0e8" />
            </linearGradient>
          </defs>
          {arcs}
        </>
      );
    }

    case "storm": {
      const r = s / 2 + s * 0.06;
      const n = 36;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const jag = i % 2 === 0 ? s * 0.0 : s * (0.035 + ((i * 5) % 3) * 0.015);
        pts.push(`${c + Math.cos(a) * (r + jag)},${c + Math.sin(a) * (r + jag)}`);
      }
      const id = `pf-storm-glow-${Math.round(s)}`;
      return (
        <>
          <defs>
            <linearGradient id="pf-storm" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e6f6ff" />
              <stop offset="0.5" stopColor="#5ad0ff" />
              <stop offset="1" stopColor="#2b6ff0" />
            </linearGradient>
            {glow(id, s)}
          </defs>
          <polygon
            points={pts.join(" ")}
            fill="none"
            stroke="rgba(90,208,255,0.4)"
            strokeWidth={s * 0.05}
            strokeLinejoin="round"
            filter={`url(#${id})`}
          />
          <polygon points={pts.join(" ")} fill="none" stroke="url(#pf-storm)" strokeWidth={s * 0.022} strokeLinejoin="round" />
          <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(230,246,255,0.5)" strokeWidth={s * 0.012} />
        </>
      );
    }

    // ---- Frames 13–30 (2026-10-01) -------------------------------------

    case "laurel": {
      const r = s * 0.575;
      const leaves = [];
      // Two branches meeting at the bottom, open at the top.
      for (const side of [-1, 1]) {
        for (let i = 0; i < 11; i++) {
          const deg = 90 + side * (12 + i * 13.5);
          const a = (deg * Math.PI) / 180;
          const x = c + Math.cos(a) * r;
          const y = c + Math.sin(a) * r;
          const tilt = deg + 90 + side * 40;
          const k = 1.25 - i * 0.045;
          leaves.push(
            <ellipse
              key={`${side}-${i}`}
              cx={x}
              cy={y}
              rx={s * 0.055 * k}
              ry={s * 0.022 * k}
              transform={`rotate(${tilt} ${x} ${y})`}
              fill="url(#pf-laurel)"
            />,
          );
        }
      }
      return (
        <>
          <defs>
            <linearGradient id="pf-laurel" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffe29a" />
              <stop offset="0.5" stopColor="#f7b733" />
              <stop offset="1" stopColor="#a8661a" />
            </linearGradient>
          </defs>
          <path
            d={`M${c + Math.cos((-60 * Math.PI) / 180) * (r - s * 0.012)} ${c + Math.sin((-60 * Math.PI) / 180) * (r - s * 0.012)} A${r - s * 0.012} ${r - s * 0.012} 0 1 1 ${c + Math.cos((-120 * Math.PI) / 180) * (r - s * 0.012)} ${c + Math.sin((-120 * Math.PI) / 180) * (r - s * 0.012)}`}
            fill="none"
            stroke="#c48a1e"
            strokeWidth={s * 0.012}
          />
          {leaves}
          <circle cx={c} cy={c + r} r={s * 0.028} fill="#ffd36b" />
        </>
      );
    }

    case "thorns": {
      const r = s * 0.555;
      const pts = [];
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const len = s * (i % 2 === 0 ? 0.08 : 0.05);
        const w = 0.09;
        pts.push(
          <path
            key={i}
            d={`M${c + Math.cos(a - w) * r} ${c + Math.sin(a - w) * r} L${c + Math.cos(a + 0.03) * (r + len)} ${c + Math.sin(a + 0.03) * (r + len)} L${c + Math.cos(a + w) * r} ${c + Math.sin(a + w) * r} Z`}
            fill="#3a0a0d"
            stroke="#c4303b"
            strokeWidth={s * 0.008}
            strokeLinejoin="round"
          />,
        );
      }
      return (
        <>
          {pts}
          <circle cx={c} cy={c} r={r} fill="none" stroke="#7a1520" strokeWidth={s * 0.035} />
          <circle cx={c} cy={c} r={r} fill="none" stroke="#e0485a" strokeWidth={s * 0.01} />
        </>
      );
    }

    case "hex": {
      const R = s * 0.6;
      const hex = (rad: number) =>
        Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          return `${c + Math.cos(a) * rad},${c + Math.sin(a) * rad}`;
        }).join(" ");
      const id = `pf-hex-glow-${Math.round(s)}`;
      return (
        <>
          <defs>
            <linearGradient id="pf-hex" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7ce7f0" />
              <stop offset="1" stopColor="#2b6ff0" />
            </linearGradient>
            {glow(id, s)}
          </defs>
          <polygon
            points={hex(R)}
            fill="none"
            stroke="rgba(124,231,240,0.35)"
            strokeWidth={s * 0.06}
            strokeLinejoin="round"
            filter={`url(#${id})`}
          />
          <polygon points={hex(R)} fill="none" stroke="url(#pf-hex)" strokeWidth={s * 0.03} strokeLinejoin="round" />
          <polygon points={hex(R - s * 0.045)} fill="none" stroke="rgba(124,231,240,0.4)" strokeWidth={s * 0.01} strokeLinejoin="round" />
        </>
      );
    }

    case "pixel": {
      const p = s * 0.05;
      const r1 = s * 0.52;
      const r2 = s * 0.62;
      const cells = [];
      const steps = Math.ceil(r2 / p) + 1;
      for (let gx = -steps; gx <= steps; gx++) {
        for (let gy = -steps; gy <= steps; gy++) {
          const x = gx * p;
          const y = gy * p;
          const d = Math.hypot(x, y);
          if (d < r1 || d > r2) continue;
          const outer = d > (r1 + r2) / 2;
          cells.push(
            <rect
              key={`${gx},${gy}`}
              x={c + x - p / 2}
              y={c + y - p / 2}
              width={p * 0.92}
              height={p * 0.92}
              fill={outer ? "#2f9e44" : "#8ef227"}
            />,
          );
        }
      }
      return <>{cells}</>;
    }

    case "crosshair": {
      const r = s * 0.56;
      const ticks = [0, 90, 180, 270].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1={c + Math.cos(a) * s * 0.47}
            y1={c + Math.sin(a) * s * 0.47}
            x2={c + Math.cos(a) * s * 0.645}
            y2={c + Math.sin(a) * s * 0.645}
            stroke="#ff3b3b"
            strokeWidth={s * 0.022}
            strokeLinecap="square"
          />
        );
      });
      const C = 2 * Math.PI * r;
      return (
        <>
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="#ff3b3b"
            strokeWidth={s * 0.022}
            strokeDasharray={`${C / 4 - s * 0.12} ${s * 0.12}`}
            strokeDashoffset={-s * 0.06}
          />
          <circle cx={c} cy={c} r={r + s * 0.05} fill="none" stroke="rgba(255,59,59,0.35)" strokeWidth={s * 0.008} />
          {ticks}
        </>
      );
    }

    case "runes": {
      const r = s * 0.545;
      const rr = s * 0.605;
      const g = s * 0.032;
      const shapes = [
        `M0 ${-g} L0 ${g} M0 ${-g * 0.4} L${g * 0.6} ${-g} M0 0 L${g * 0.6} ${-g * 0.4}`,
        `M${-g * 0.6} ${g} L0 ${-g} L${g * 0.6} ${g}`,
        `M${-g * 0.6} ${-g} L${g * 0.6} ${g} M${g * 0.6} ${-g} L${-g * 0.6} ${g}`,
        `M0 ${-g} L${g * 0.6} 0 L0 ${g} L${-g * 0.6} 0 Z`,
        `M0 ${-g} L0 ${g} M0 ${-g} L${g * 0.6} ${-g * 0.3} L0 ${g * 0.3}`,
        `M${-g * 0.5} ${-g} L${-g * 0.5} ${g} M${g * 0.5} ${-g} L${g * 0.5} ${g} M${-g * 0.5} 0 L${g * 0.5} 0`,
      ];
      const glyphs = Array.from({ length: 12 }, (_, i) => {
        const deg = (i / 12) * 360;
        const a = (deg * Math.PI) / 180;
        return (
          <path
            key={i}
            d={shapes[i % shapes.length]}
            transform={`translate(${c + Math.cos(a) * rr} ${c + Math.sin(a) * rr}) rotate(${deg + 90})`}
            fill="none"
            stroke="#5eead4"
            strokeWidth={s * 0.012}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      });
      const id = `pf-runes-glow-${Math.round(s)}`;
      return (
        <>
          <defs>{glow(id, s)}</defs>
          <circle cx={c} cy={c} r={r} fill="none" stroke="#14b8a6" strokeWidth={s * 0.02} />
          <circle cx={c} cy={c} r={s * 0.645} fill="none" stroke="rgba(94,234,212,0.35)" strokeWidth={s * 0.008} />
          <g filter={`url(#${id})`}>{glyphs}</g>
        </>
      );
    }

    case "sakura": {
      const r = s * 0.575;
      const flowers = Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        const k = i % 2 === 0 ? 1 : 0.75;
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${i * 23}) scale(${k})`}>
            {[0, 72, 144, 216, 288].map((d) => (
              <ellipse
                key={d}
                cx={0}
                cy={-s * 0.03}
                rx={s * 0.02}
                ry={s * 0.032}
                transform={`rotate(${d})`}
                fill="url(#pf-sakura)"
              />
            ))}
            <circle r={s * 0.012} fill="#ffd36b" />
          </g>
        );
      });
      return (
        <>
          <defs>
            <radialGradient id="pf-sakura">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#f472b6" />
            </radialGradient>
          </defs>
          <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(244,114,182,0.6)" strokeWidth={s * 0.015} />
          {flowers}
        </>
      );
    }

    case "wave": {
      const ring = (base: number, amp: number, phase: number) => {
        const pts = [];
        for (let i = 0; i <= 180; i++) {
          const a = (i / 180) * Math.PI * 2;
          const rad = base + amp * Math.sin(a * 8 + phase);
          pts.push(`${i ? "L" : "M"}${c + Math.cos(a) * rad} ${c + Math.sin(a) * rad}`);
        }
        return pts.join(" ") + " Z";
      };
      return (
        <>
          <defs>
            <linearGradient id="pf-wave" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7ce7f0" />
              <stop offset="1" stopColor="#2563eb" />
            </linearGradient>
          </defs>
          <path d={ring(s * 0.58, s * 0.025, Math.PI)} fill="none" stroke="rgba(124,231,240,0.4)" strokeWidth={s * 0.014} />
          <path d={ring(s * 0.565, s * 0.025, 0)} fill="none" stroke="url(#pf-wave)" strokeWidth={s * 0.032} strokeLinejoin="round" />
        </>
      );
    }

    case "volt": {
      const r = s * 0.555;
      // A classic bolt, drawn pointing "down" in a 0.6 x 1 box, then
      // turned so "down" is outward from the ring.
      const shape: [number, number][] = [
        [0.12, 0], [0.55, 0], [0.38, 0.4], [0.6, 0.4], [0.18, 1], [0.3, 0.55], [0.06, 0.55],
      ];
      const h = s * 0.115;
      const bolt = (deg: number) => {
        const a = (deg * Math.PI) / 180;
        const x = c + Math.cos(a) * (r - s * 0.015);
        const y = c + Math.sin(a) * (r - s * 0.015);
        const pts = shape.map(([u, v]) => `${(u - 0.33) * h * 1.7},${v * h}`).join(" ");
        return (
          <polygon
            key={deg}
            points={pts}
            transform={`translate(${x} ${y}) rotate(${deg - 90})`}
            fill="#fef08a"
            stroke="#eab308"
            strokeWidth={s * 0.007}
            strokeLinejoin="round"
          />
        );
      };
      const id = `pf-volt-glow-${Math.round(s)}`;
      return (
        <>
          <defs>{glow(id, s)}</defs>
          <circle cx={c} cy={c} r={r} fill="none" stroke="#facc15" strokeWidth={s * 0.028} filter={`url(#${id})`} />
          <g filter={`url(#${id})`}>{[-45, 45, 135, 225].map(bolt)}</g>
        </>
      );
    }

    case "galaxy": {
      let seed = 11;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const colours = ["#ffffff", "#c4b5fd", "#f0abfc", "#93c5fd"];
      const stars = Array.from({ length: 46 }, (_, i) => {
        const a = rnd() * Math.PI * 2;
        const rad = s * (0.535 + rnd() * 0.1);
        return (
          <circle
            key={i}
            cx={c + Math.cos(a) * rad}
            cy={c + Math.sin(a) * rad}
            r={s * (0.006 + rnd() * 0.014)}
            fill={colours[i % colours.length]}
            opacity={0.5 + rnd() * 0.5}
          />
        );
      });
      const id = `pf-galaxy-glow-${Math.round(s)}`;
      return (
        <>
          <defs>{glow(id, s)}</defs>
          <circle cx={c} cy={c} r={s * 0.585} fill="none" stroke="rgba(139,92,246,0.35)" strokeWidth={s * 0.07} filter={`url(#${id})`} />
          {stars}
        </>
      );
    }

    case "gear": {
      const n = 16;
      const r1 = s * 0.555;
      const r2 = s * 0.625;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const step = (Math.PI * 2) / n;
        const at = (a: number, rad: number) => `${c + Math.cos(a) * rad},${c + Math.sin(a) * rad}`;
        pts.push(at(a0, r1), at(a0 + step * 0.15, r2), at(a0 + step * 0.5, r2), at(a0 + step * 0.65, r1));
      }
      const inner = s * 0.515;
      return (
        <>
          <defs>
            <linearGradient id="pf-gear" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f4c27a" />
              <stop offset="0.5" stopColor="#b8732e" />
              <stop offset="1" stopColor="#6b3d14" />
            </linearGradient>
          </defs>
          <path
            d={`M${pts.join(" L")} Z M${c + inner} ${c} A${inner} ${inner} 0 1 0 ${c - inner} ${c} A${inner} ${inner} 0 1 0 ${c + inner} ${c} Z`}
            fill="url(#pf-gear)"
            fillRule="evenodd"
            stroke="#3b220b"
            strokeWidth={s * 0.006}
          />
        </>
      );
    }

    case "chain": {
      const r = s * 0.575;
      const n = 16;
      const links = Array.from({ length: n }, (_, i) => {
        const deg = (i / n) * 360;
        const a = (deg * Math.PI) / 180;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        const flat = i % 2 === 0;
        return (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx={s * (flat ? 0.075 : 0.07)}
            ry={s * (flat ? 0.036 : 0.014)}
            transform={`rotate(${deg + 90} ${x} ${y})`}
            fill="none"
            stroke={flat ? "url(#pf-chain)" : "#d1d5db"}
            strokeWidth={s * (flat ? 0.02 : 0.024)}
          />
        );
      });
      return (
        <>
          <defs>
            <linearGradient id="pf-chain" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f3f4f6" />
              <stop offset="1" stopColor="#6b7280" />
            </linearGradient>
          </defs>
          {links}
        </>
      );
    }

    case "gem": {
      const r = s * 0.56;
      const gem = (deg: number) => {
        const a = (deg * Math.PI) / 180;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        const h = s * 0.075;
        const w = s * 0.05;
        return (
          <g key={deg} transform={`translate(${x} ${y}) rotate(${deg + 90})`}>
            <path d={`M0 ${-h} L${w} 0 L0 ${h} L${-w} 0 Z`} fill="url(#pf-gem)" stroke="#e0f2fe" strokeWidth={s * 0.008} />
            <path d={`M0 ${-h} L0 ${h} M${-w} 0 L${w} 0`} stroke="rgba(255,255,255,0.55)" strokeWidth={s * 0.005} />
          </g>
        );
      };
      return (
        <>
          <defs>
            <linearGradient id="pf-gem" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e0f2fe" />
              <stop offset="0.5" stopColor="#38bdf8" />
              <stop offset="1" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>
          <circle cx={c} cy={c} r={r - s * 0.018} fill="none" stroke="#cbd5e1" strokeWidth={s * 0.01} />
          <circle cx={c} cy={c} r={r + s * 0.018} fill="none" stroke="#94a3b8" strokeWidth={s * 0.01} />
          {[45, 135, 225, 315].map((d) => {
            const a = (d * Math.PI) / 180;
            return <circle key={`d${d}`} cx={c + Math.cos(a) * r} cy={c + Math.sin(a) * r} r={s * 0.014} fill="#e2e8f0" />;
          })}
          {[0, 90, 180, 270].map(gem)}
        </>
      );
    }

    case "venom": {
      const r = s * 0.555;
      const drips = [70, 84, 98, 112].map((deg, i) => {
        const a = (deg * Math.PI) / 180;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        const len = s * [0.06, 0.09, 0.05, 0.075][i];
        const w = s * 0.018;
        return (
          <path
            key={deg}
            d={`M${x - w} ${y} C${x - w} ${y + len * 0.6} ${x - w * 1.3} ${y + len} ${x} ${y + len} C${x + w * 1.3} ${y + len} ${x + w} ${y + len * 0.6} ${x + w} ${y} Z`}
            fill="url(#pf-venom)"
          />
        );
      });
      const id = `pf-venom-glow-${Math.round(s)}`;
      return (
        <>
          <defs>
            <linearGradient id="pf-venom" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#a3e635" />
              <stop offset="1" stopColor="#15803d" />
            </linearGradient>
            {glow(id, s)}
          </defs>
          <g filter={`url(#${id})`}>
            <circle cx={c} cy={c} r={r} fill="none" stroke="url(#pf-venom)" strokeWidth={s * 0.04} />
            {drips}
          </g>
        </>
      );
    }

    case "solar": {
      const r = s * 0.55;
      const rays = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        const len = s * (i % 2 === 0 ? 0.095 : 0.055);
        const w = 0.07;
        return (
          <path
            key={i}
            d={`M${c + Math.cos(a - w) * r} ${c + Math.sin(a - w) * r} L${c + Math.cos(a) * (r + len)} ${c + Math.sin(a) * (r + len)} L${c + Math.cos(a + w) * r} ${c + Math.sin(a + w) * r} Z`}
            fill="url(#pf-solar)"
          />
        );
      });
      return (
        <>
          <defs>
            <radialGradient id="pf-solar" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0.75" stopColor="#ffd36b" />
              <stop offset="1" stopColor="#ff7a2f" />
            </radialGradient>
          </defs>
          {rays}
          <circle cx={c} cy={c} r={r} fill="none" stroke="#ffb547" strokeWidth={s * 0.03} />
        </>
      );
    }

    case "comet": {
      const r = s * 0.575;
      const segs = Array.from({ length: 14 }, (_, i) => {
        const a0 = -Math.PI / 2 - i * 0.12;
        const a1 = a0 - 0.13;
        return (
          <path
            key={i}
            d={`M${c + Math.cos(a0) * r} ${c + Math.sin(a0) * r} A${r} ${r} 0 0 0 ${c + Math.cos(a1) * r} ${c + Math.sin(a1) * r}`}
            fill="none"
            stroke="#a5f3fc"
            strokeWidth={s * (0.04 - i * 0.0026)}
            strokeLinecap="round"
            opacity={1 - i / 14}
          />
        );
      });
      const id = `pf-comet-glow-${Math.round(s)}`;
      return (
        <>
          <defs>{glow(id, s)}</defs>
          <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(165,243,252,0.18)" strokeWidth={s * 0.012} />
          <g filter={`url(#${id})`}>
            {segs}
            <circle cx={c} cy={c - r} r={s * 0.032} fill="#ffffff" />
          </g>
        </>
      );
    }

    case "glitch": {
      const r = s * 0.565;
      const C = 2 * Math.PI * r;
      const dash = `${C * 0.21} ${C * 0.015} ${C * 0.09} ${C * 0.02} ${C * 0.14} ${C * 0.01}`;
      return (
        <>
          <circle cx={c - s * 0.018} cy={c} r={r} fill="none" stroke="#ff2e63" strokeWidth={s * 0.03} strokeDasharray={dash} opacity="0.85" />
          <circle cx={c + s * 0.018} cy={c + s * 0.004} r={r} fill="none" stroke="#08f7fe" strokeWidth={s * 0.03} strokeDasharray={dash} strokeDashoffset={C * 0.05} opacity="0.85" />
          <circle cx={c} cy={c} r={r} fill="none" stroke="#f5f5f5" strokeWidth={s * 0.016} strokeDasharray={dash} strokeDashoffset={C * 0.02} />
        </>
      );
    }

    case "royal": {
      const r = s * 0.565;
      const studs = Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <circle
            key={i}
            cx={c + Math.cos(a) * r}
            cy={c + Math.sin(a) * r}
            r={s * (i % 3 === 0 ? 0.024 : 0.015)}
            fill="url(#pf-royal-gold)"
            stroke="#5b3a0a"
            strokeWidth={s * 0.004}
          />
        );
      });
      return (
        <>
          <defs>
            <linearGradient id="pf-royal" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#a855f7" />
              <stop offset="1" stopColor="#4c1d95" />
            </linearGradient>
            <linearGradient id="pf-royal-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffe29a" />
              <stop offset="1" stopColor="#c48a1e" />
            </linearGradient>
          </defs>
          <circle cx={c} cy={c} r={r} fill="none" stroke="url(#pf-royal)" strokeWidth={s * 0.05} />
          <circle cx={c} cy={c} r={r - s * 0.027} fill="none" stroke="url(#pf-royal-gold)" strokeWidth={s * 0.007} />
          <circle cx={c} cy={c} r={r + s * 0.027} fill="none" stroke="url(#pf-royal-gold)" strokeWidth={s * 0.007} />
          {studs}
        </>
      );
    }

    default:
      return null;
  }
}
