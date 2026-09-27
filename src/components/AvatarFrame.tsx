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

    default:
      return null;
  }
}
