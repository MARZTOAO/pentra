import { useState } from "react";

/**
 * The pet, drawn. A placeholder until the artwork arrives.
 *
 * MARZ is getting art made. When it's ready, drop PNGs into
 * `public/pets/` named `<species>-<stage>.png` (e.g. `blip-2.png`) and
 * `egg.png`, then set ART_READY below to true; this component then
 * tries the image first and falls back to the built-in shape for any
 * file that isn't there. Nothing else changes.
 *
 * The shapes match the concept art: a simple geometric body with a
 * face, bigger at each stage; stage 3 gets a crest and a dashed glow.
 * A napping pet (hunger or mood at 0) is greyed out with closed eyes.
 */

/** Flip to true once the PNGs are in public/pets/. */
const ART_READY = false;

type Props = {
  species: string | null;
  shape: string | null;
  color: string | null;
  edge: string | null;
  stage: 1 | 2 | 3;
  napping?: boolean;
  isEgg?: boolean;
  /** Pixel size; the SVG is square. */
  size?: number;
  className?: string;
};

const C = 50;
const CY = 58;

function polyPath(n: number, r: number, rot: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    pts.push(`${(C + r * Math.cos(a)).toFixed(1)} ${(CY + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

function starPath(r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.5;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(C + rr * Math.cos(a)).toFixed(1)} ${(CY + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

const SHAPES: Record<string, (r: number) => string> = {
  pent: (r) => polyPath(5, r, -Math.PI / 2),
  circle: (r) => `M${C - r} ${CY} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`,
  square: (r) => polyPath(4, r, Math.PI / 4),
  tri: (r) => polyPath(3, r, -Math.PI / 2),
  gem: (r) => polyPath(4, r, 0),
  hex: (r) => polyPath(6, r, 0),
  blob: (r) =>
    `M${C} ${CY - r} C${C + r * 1.2} ${CY - r} ${C + r * 1.1} ${CY + r * 0.9} ${C} ${CY + r} C${C - r * 1.3} ${CY + r * 1.05} ${C - r * 1.1} ${CY - r * 0.8} ${C} ${CY - r}`,
  star: starPath,
  drop: (r) =>
    `M${C} ${CY - r * 1.2} C${C + r * 0.9} ${CY - r * 0.2} ${C + r} ${CY + r * 0.3} ${C} ${CY + r} C${C - r} ${CY + r * 0.3} ${C - r * 0.9} ${CY - r * 0.2} ${C} ${CY - r * 1.2}`,
  pill: (r) =>
    `M${C - r * 1.3} ${CY - r * 0.6} h${r * 2.6} a${r * 0.6} ${r * 0.6} 0 0 1 0 ${r * 1.2} h${-r * 2.6} a${r * 0.6} ${r * 0.6} 0 0 1 0 ${-r * 1.2} Z`,
};

export function PetSprite({ species, shape, color, edge, stage, napping, isEgg, size = 96, className }: Props) {
  const src = !ART_READY ? null : isEgg ? "/pets/egg.png" : species ? `/pets/${species}-${stage}.png` : null;
  // Which image failed to load, so a new stage's image still gets tried.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt=""
        draggable={false}
        onError={() => setFailedSrc(src)}
        className={`${napping ? "opacity-50 grayscale" : ""} ${className ?? ""}`}
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    );
  }

  if (isEgg) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className={className}>
        <ellipse cx="50" cy="94" rx="26" ry="4" fill="rgba(0,0,0,0.5)" />
        <path
          d="M50 8 C76 8 86 44 86 66 C86 86 70 92 50 92 C30 92 14 86 14 66 C14 44 24 8 50 8 Z"
          fill="#23262c"
          stroke="#3a3f48"
          strokeWidth="2"
        />
        <polygon points="50,34 60,41 56,53 44,53 40,41" fill="none" stroke="#ff7a2f" strokeWidth="2" strokeLinejoin="round" opacity="0.9" />
        <polygon points="32,66 38,70 36,77 28,77 26,70" fill="none" stroke="#ff7a2f" strokeWidth="1.5" strokeLinejoin="round" opacity="0.5" />
        <polygon points="68,62 74,66 72,73 64,73 62,66" fill="none" stroke="#ff7a2f" strokeWidth="1.5" strokeLinejoin="round" opacity="0.5" />
      </svg>
    );
  }

  const i = stage - 1;
  const r = [18, 26, 32][i];
  const eyeOff = [5, 7, 9][i];
  const eyeY = [CY - 2, CY - 4, CY - 6][i];
  const eyeR = [2.5, 3.5, 4][i];
  const fill = color ?? "#ff7a2f";
  const stroke = edge ?? "#ffb27a";
  const draw = SHAPES[shape ?? "pent"] ?? SHAPES.pent;
  const crest = `${C - 12},${CY - r + 6} ${C - 16},${CY - r - 12} ${C - 4},${CY - r + 2} ${C + 12},${CY - r + 6} ${C + 16},${CY - r - 12} ${C + 4},${CY - r + 2}`;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      className={`${napping ? "opacity-50 grayscale" : ""} ${className ?? ""}`}
    >
      {stage === 3 && <circle cx={C} cy={CY} r="42" fill="none" stroke={fill} strokeWidth="2" strokeDasharray="4 6" opacity="0.6" />}
      <ellipse cx={C} cy="94" rx={r + 2} ry="4" fill="rgba(0,0,0,0.5)" />
      {stage === 3 && <polygon points={crest} fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />}
      <path d={draw(r)} fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      {napping ? (
        <>
          <path d={`M${C - eyeOff - 3} ${eyeY} h6`} stroke="#15161a" strokeWidth="2.5" strokeLinecap="round" />
          <path d={`M${C + eyeOff - 3} ${eyeY} h6`} stroke="#15161a" strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx={C - eyeOff} cy={eyeY} r={eyeR} fill="#15161a" />
          <circle cx={C + eyeOff} cy={eyeY} r={eyeR} fill="#15161a" />
          {stage >= 2 && (
            <>
              <circle cx={C - eyeOff + 1.5} cy={eyeY - 1.5} r="1.2" fill="#fff" />
              <circle cx={C + eyeOff + 1.5} cy={eyeY - 1.5} r="1.2" fill="#fff" />
            </>
          )}
        </>
      )}
      {stage >= 2 && !napping && (
        <path
          d={`M${C - 6} ${eyeY + 12} Q${C} ${eyeY + 17} ${C + 6} ${eyeY + 12}`}
          stroke="#15161a"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
