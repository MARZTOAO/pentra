/**
 * The built-in pet drawings (until the commissioned art arrives; see
 * public/pets/README.md). Pure functions that return SVG markup for a
 * 100×100 viewBox, so the same code draws the profile card, the mini
 * game and the preview sheet.
 *
 * MARZ: stage 1 stays the little shape with dot eyes. Stages 2 and 3
 * should feel like creatures (Digimon / Pokémon energy, but ours): the
 * shape becomes a head-and-body with legs, arms, ears, a tail, and by
 * stage 3 wings, horns, armour or a mane, plus sharp eyes.
 */

export type PetArtInput = {
  shape: string | null;
  color: string | null;
  edge: string | null;
  stage: 1 | 2 | 3;
  napping?: boolean;
};

const C = 50;
const INK = "#15161a";

const f = (n: number) => (Math.round(n * 10) / 10).toString();

function polyPts(n: number, r: number, rot: number, cx: number, cy: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}
const pathOf = (pts: [number, number][]) => `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(" L")} Z`;
const polyPath = (n: number, r: number, rot: number, cx: number, cy: number) => pathOf(polyPts(n, r, rot, cx, cy));

function starPath(r: number, cx: number, cy: number, inner = 0.5): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return pathOf(pts);
}
const circlePath = (r: number, cx: number, cy: number) => `M${f(cx - r)} ${f(cy)} a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0 a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`;
const blobPath = (r: number, cx: number, cy: number) =>
  `M${f(cx)} ${f(cy - r)} C${f(cx + r * 1.2)} ${f(cy - r)} ${f(cx + r * 1.1)} ${f(cy + r * 0.9)} ${f(cx)} ${f(cy + r)} C${f(cx - r * 1.3)} ${f(cy + r * 1.05)} ${f(cx - r * 1.1)} ${f(cy - r * 0.8)} ${f(cx)} ${f(cy - r)}`;
const dropPath = (r: number, cx: number, cy: number) =>
  `M${f(cx)} ${f(cy - r * 1.2)} C${f(cx + r * 0.9)} ${f(cy - r * 0.2)} ${f(cx + r)} ${f(cy + r * 0.3)} ${f(cx)} ${f(cy + r)} C${f(cx - r)} ${f(cy + r * 0.3)} ${f(cx - r * 0.9)} ${f(cy - r * 0.2)} ${f(cx)} ${f(cy - r * 1.2)}`;
const pillPath = (r: number, cx: number, cy: number) =>
  `M${f(cx - r * 1.3)} ${f(cy - r * 0.6)} h${f(r * 2.6)} a${f(r * 0.6)} ${f(r * 0.6)} 0 0 1 0 ${f(r * 1.2)} h${f(-r * 2.6)} a${f(r * 0.6)} ${f(r * 0.6)} 0 0 1 0 ${f(-r * 1.2)} Z`;

// A crescent facing right, drawn so its fat side sits at the centre
// (where the face goes) and the horns reach out to the right.
const crescentPath = (r: number, cx: number, cy: number) => {
  const x = cx - r * 0.55;
  return `M${f(x)} ${f(cy - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(cy + r)} A${f(r * 2.2)} ${f(r * 2.2)} 0 0 0 ${f(x)} ${f(cy - r)} Z`;
};
const boltPath = (r: number, cx: number, cy: number) =>
  pathOf([
    [cx + r * 0.15, cy - r * 1.25],
    [cx + r * 0.6, cy - r * 1.25],
    [cx + r * 0.15, cy - r * 0.2],
    [cx + r * 0.6, cy - r * 0.2],
    [cx - r * 0.25, cy + r * 1.25],
    [cx - r * 0.05, cy + r * 0.2],
    [cx - r * 0.6, cy + r * 0.2],
  ]);
const heartPath = (r: number, cx: number, cy: number) =>
  `M${f(cx)} ${f(cy + r)} C${f(cx - r * 1.4)} ${f(cy)} ${f(cx - r * 1.1)} ${f(cy - r * 1.1)} ${f(cx)} ${f(cy - r * 0.45)} C${f(cx + r * 1.1)} ${f(cy - r * 1.1)} ${f(cx + r * 1.4)} ${f(cy)} ${f(cx)} ${f(cy + r)} Z`;
const leafPath = (r: number, cx: number, cy: number) =>
  `M${f(cx)} ${f(cy - r * 1.2)} Q${f(cx + r * 1.15)} ${f(cy - r * 0.2)} ${f(cx)} ${f(cy + r * 1.1)} Q${f(cx - r * 1.15)} ${f(cy - r * 0.2)} ${f(cx)} ${f(cy - r * 1.2)} Z`;
const ghostPath = (r: number, cx: number, cy: number) =>
  `M${f(cx - r)} ${f(cy + r * 0.9)} V${f(cy)} A${f(r)} ${f(r)} 0 0 1 ${f(cx + r)} ${f(cy)} V${f(cy + r * 0.9)} q${f(-r / 3)} -7 ${f((-2 * r) / 3)} 0 q${f(-r / 3)} 7 ${f((-2 * r) / 3)} 0 q${f(-r / 3)} -7 ${f((-2 * r) / 3)} 0 Z`;
const mushroomPath = (r: number, cx: number, cy: number) =>
  `M${f(cx - r * 0.5)} ${f(cy + r * 1.05)} V${f(cy + r * 0.1)} H${f(cx - r * 1.25)} A${f(r * 1.25)} ${f(r * 1.1)} 0 0 1 ${f(cx + r * 1.25)} ${f(cy + r * 0.1)} H${f(cx + r * 0.5)} V${f(cy + r * 1.05)} a${f(r * 0.5)} ${f(r * 0.25)} 0 0 1 ${f(-r)} 0 Z`;
const skullPath = (r: number, cx: number, cy: number) =>
  `M${f(cx - r)} ${f(cy - r * 0.2)} A${f(r)} ${f(r)} 0 0 1 ${f(cx + r)} ${f(cy - r * 0.2)} V${f(cy + r * 0.45)} L${f(cx + r * 0.6)} ${f(cy + r * 0.6)} V${f(cy + r)} H${f(cx - r * 0.6)} V${f(cy + r * 0.6)} L${f(cx - r)} ${f(cy + r * 0.45)} Z`;
const cactusPath = (r: number, cx: number, cy: number) =>
  `M${f(cx - r * 0.6)} ${f(cy + r * 1.1)} V${f(cy - r * 0.5)} a${f(r * 0.6)} ${f(r * 0.6)} 0 0 1 ${f(r * 1.2)} 0 V${f(cy + r * 1.1)} Z`;
const flakePath = (r: number, cx: number, cy: number) => {
  const pts: [number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const rr = i % 2 === 0 ? r * 1.15 : r * 0.62;
    const a = -Math.PI / 2 + (i * Math.PI) / 6;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return pathOf(pts);
};
const octoPath = (r: number, cx: number, cy: number) =>
  `M${f(cx - r)} ${f(cy)} A${f(r)} ${f(r)} 0 0 1 ${f(cx + r)} ${f(cy)} V${f(cy + r * 0.45)} q${f(-r / 4)} ${f(r * 0.6)} ${f(-r / 2)} 0 q${f(-r / 4)} ${f(r * 0.6)} ${f(-r / 2)} 0 q${f(-r / 4)} ${f(r * 0.6)} ${f(-r / 2)} 0 q${f(-r / 4)} ${f(r * 0.6)} ${f(-r / 2)} 0 Z`;

const flamePath = (r: number, cx: number, cy: number) =>
  `M${f(cx)} ${f(cy - r * 1.35)} C${f(cx + r * 0.35)} ${f(cy - r * 0.9)} ${f(cx + r * 1.05)} ${f(cy - r * 0.55)} ${f(cx + r)} ${f(cy + r * 0.25)} C${f(cx + r * 0.95)} ${f(cy + r * 0.85)} ${f(cx + r * 0.55)} ${f(cy + r * 1.1)} ${f(cx)} ${f(cy + r * 1.1)} C${f(cx - r * 0.55)} ${f(cy + r * 1.1)} ${f(cx - r * 0.95)} ${f(cy + r * 0.85)} ${f(cx - r)} ${f(cy + r * 0.25)} C${f(cx - r * 1.05)} ${f(cy - r * 0.3)} ${f(cx - r * 0.5)} ${f(cy - r * 0.55)} ${f(cx - r * 0.35)} ${f(cy - r * 1.0)} C${f(cx - r * 0.2)} ${f(cy - r * 0.75)} ${f(cx - r * 0.05)} ${f(cy - r * 0.9)} ${f(cx)} ${f(cy - r * 1.35)} Z`;
const padPath = (r: number, cx: number, cy: number) =>
  `M${f(cx - r * 1.3)} ${f(cy - r * 0.35)} a${f(r * 0.45)} ${f(r * 0.45)} 0 0 1 ${f(r * 0.45)} ${f(-r * 0.45)} h${f(r * 1.7)} a${f(r * 0.45)} ${f(r * 0.45)} 0 0 1 ${f(r * 0.45)} ${f(r * 0.45)} v${f(r * 0.35)} a${f(r * 0.65)} ${f(r * 0.65)} 0 0 1 ${f(-r * 0.7)} ${f(r * 0.85)} l${f(-r * 0.35)} ${f(-r * 0.4)} h${f(-r * 1.0)} l${f(-r * 0.35)} ${f(r * 0.4)} a${f(r * 0.65)} ${f(r * 0.65)} 0 0 1 ${f(-r * 0.7)} ${f(-r * 0.85)} Z`;
const rocketPath = (r: number, cx: number, cy: number) =>
  `M${f(cx)} ${f(cy - r * 1.35)} Q${f(cx + r * 0.75)} ${f(cy - r * 0.6)} ${f(cx + r * 0.6)} ${f(cy + r * 0.5)} L${f(cx + r * 0.6)} ${f(cy + r * 0.95)} H${f(cx - r * 0.6)} L${f(cx - r * 0.6)} ${f(cy + r * 0.5)} Q${f(cx - r * 0.75)} ${f(cy - r * 0.6)} ${f(cx)} ${f(cy - r * 1.35)} Z`;
const penguinPath = (r: number, cx: number, cy: number) =>
  `M${f(cx)} ${f(cy - r * 1.15)} C${f(cx + r * 0.95)} ${f(cy - r * 1.15)} ${f(cx + r * 1.05)} ${f(cy + r * 0.2)} ${f(cx + r * 0.95)} ${f(cy + r * 0.7)} C${f(cx + r * 0.8)} ${f(cy + r * 1.15)} ${f(cx - r * 0.8)} ${f(cy + r * 1.15)} ${f(cx - r * 0.95)} ${f(cy + r * 0.7)} C${f(cx - r * 1.05)} ${f(cy + r * 0.2)} ${f(cx - r * 0.95)} ${f(cy - r * 1.15)} ${f(cx)} ${f(cy - r * 1.15)} Z`;
const dinoPath = (r: number, cx: number, cy: number) =>
  `M${f(cx - r)} ${f(cy)} A${f(r)} ${f(r)} 0 1 1 ${f(cx + r)} ${f(cy)} A${f(r)} ${f(r)} 0 0 1 ${f(cx - r)} ${f(cy)} Z ` +
  `M${f(cx - r * 0.75)} ${f(cy - r * 0.62)} l${f(-r * 0.25)} ${f(-r * 0.6)} l${f(r * 0.55)} ${f(r * 0.3)} Z ` +
  `M${f(cx - r * 0.25)} ${f(cy - r * 0.95)} l${f(r * 0.08)} ${f(-r * 0.65)} l${f(r * 0.45)} ${f(r * 0.45)} Z ` +
  `M${f(cx + r * 0.35)} ${f(cy - r * 0.92)} l${f(r * 0.35)} ${f(-r * 0.5)} l${f(r * 0.25)} ${f(r * 0.55)} Z`;
const fishPath = (r: number, cx: number, cy: number) =>
  `M${f(cx - r * 1.05)} ${f(cy)} a${f(r * 0.85)} ${f(r * 0.68)} 0 1 1 ${f(r * 1.7)} 0 a${f(r * 0.85)} ${f(r * 0.68)} 0 1 1 ${f(-r * 1.7)} 0 Z M${f(cx + r * 0.6)} ${f(cy)} L${f(cx + r * 1.35)} ${f(cy - r * 0.7)} L${f(cx + r * 1.2)} ${f(cy)} L${f(cx + r * 1.35)} ${f(cy + r * 0.7)} Z`;
const batPath = (r: number, cx: number, cy: number) =>
  `M${f(cx - r)} ${f(cy - r * 0.15)} L${f(cx - r * 0.95)} ${f(cy - r * 1.25)} L${f(cx - r * 0.4)} ${f(cy - r * 0.75)} Q${f(cx)} ${f(cy - r * 0.95)} ${f(cx + r * 0.4)} ${f(cy - r * 0.75)} L${f(cx + r * 0.95)} ${f(cy - r * 1.25)} L${f(cx + r)} ${f(cy - r * 0.15)} A${f(r)} ${f(r)} 0 0 1 ${f(cx - r)} ${f(cy - r * 0.15)} Z`;
const botPath = (r: number, cx: number, cy: number) =>
  `M${f(cx - r)} ${f(cy - r * 0.75)} a${f(r * 0.25)} ${f(r * 0.25)} 0 0 1 ${f(r * 0.25)} ${f(-r * 0.25)} h${f(r * 1.5)} a${f(r * 0.25)} ${f(r * 0.25)} 0 0 1 ${f(r * 0.25)} ${f(r * 0.25)} v${f(r * 1.6)} a${f(r * 0.25)} ${f(r * 0.25)} 0 0 1 ${f(-r * 0.25)} ${f(r * 0.25)} h${f(-r * 1.5)} a${f(r * 0.25)} ${f(r * 0.25)} 0 0 1 ${f(-r * 0.25)} ${f(-r * 0.25)} Z`;
const crownPath = (r: number, cx: number, cy: number) =>
  pathOf([
    [cx - r * 1.1, cy + r * 0.85],
    [cx - r * 1.1, cy - r * 0.45],
    [cx - r * 0.55, cy + r * 0.05],
    [cx, cy - r * 0.95],
    [cx + r * 0.55, cy + r * 0.05],
    [cx + r * 1.1, cy - r * 0.45],
    [cx + r * 1.1, cy + r * 0.85],
  ]);
const shieldPath = (r: number, cx: number, cy: number) =>
  `M${f(cx - r)} ${f(cy - r * 0.95)} H${f(cx + r)} V${f(cy + r * 0.1)} Q${f(cx + r)} ${f(cy + r * 0.8)} ${f(cx)} ${f(cy + r * 1.15)} Q${f(cx - r)} ${f(cy + r * 0.8)} ${f(cx - r)} ${f(cy + r * 0.1)} Z`;

/** Shapes with room for a lighter belly patch under the face. */
const BELLY = new Set(["pent", "circle", "square", "gem", "hex", "blob", "drop", "pill", "heart", "ghost", "skull", "cactus", "octo", "flame", "bat", "bot", "shield", "leaf", "dino"]);

/** Where the face sits relative to the body centre, per shape. */
const EYE_DY: Record<string, number> = {
  mushroom: 12, skull: -4, octo: -4, ghost: -3, cactus: -4, crescent: 0, heart: -2,
  flame: 5, rocket: -2, crown: 4, shield: -2, bat: -1, penguin: -5, dino: -2,
};
/** A horizontal nudge for the face, per shape (the crescent's thick side). */
const EYE_DX: Record<string, number> = { crescent: 1, fish: -5 };

const SHAPES: Record<string, (r: number, cx: number, cy: number) => string> = {
  crescent: crescentPath,
  bolt: boltPath,
  heart: heartPath,
  leaf: leafPath,
  ghost: ghostPath,
  mushroom: mushroomPath,
  skull: skullPath,
  cactus: cactusPath,
  flake: flakePath,
  octo: octoPath,
  flame: flamePath,
  pad: padPath,
  rocket: rocketPath,
  penguin: penguinPath,
  dino: dinoPath,
  fish: fishPath,
  bat: batPath,
  bot: botPath,
  crown: crownPath,
  shield: shieldPath,
  pent: (r, cx, cy) => polyPath(5, r, -Math.PI / 2, cx, cy),
  circle: circlePath,
  square: (r, cx, cy) => polyPath(4, r, Math.PI / 4, cx, cy),
  tri: (r, cx, cy) => polyPath(3, r, -Math.PI / 2, cx, cy),
  gem: (r, cx, cy) => polyPath(4, r, 0, cx, cy),
  hex: (r, cx, cy) => polyPath(6, r, 0, cx, cy),
  blob: blobPath,
  star: (r, cx, cy) => starPath(r, cx, cy),
  drop: dropPath,
  pill: pillPath,
};

// ---- Drawing helpers ----------------------------------------------------

type Pal = { fill: string; edge: string };

const solid = (d: string, p: Pal, extra = "") =>
  `<path d="${d}" fill="${p.fill}" stroke="${p.edge}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const light = (d: string, p: Pal, o = 0.35, extra = "") => `<path d="${d}" fill="${p.edge}" opacity="${o}" ${extra}/>`;
const dark = (d: string, o = 0.25, extra = "") => `<path d="${d}" fill="${INK}" opacity="${o}" ${extra}/>`;

/** A limb: a thick outlined stroke along a path. */
const limb = (d: string, p: Pal, w = 7) =>
  `<path d="${d}" stroke="${p.edge}" stroke-width="${w + 3}" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" stroke="${p.fill}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Two stubby legs with little feet under a body whose bottom is at y. */
const legs = (y: number, p: Pal, spread = 9, len = 9, w = 7) =>
  limb(`M${f(C - spread)} ${f(y - 2)} v${f(len)}`, p, w) +
  limb(`M${f(C + spread)} ${f(y - 2)} v${f(len)}`, p, w) +
  `<path d="M${f(C - spread - 5)} ${f(y + len + 1)} h9 M${f(C + spread - 4)} ${f(y + len + 1)} h9" stroke="${p.edge}" stroke-width="3" stroke-linecap="round"/>`;

/** Claws: three little white points under each foot. */
const claws = (y: number, spread = 9) =>
  [C - spread, C + spread]
    .map((x) => `<path d="M${f(x - 4)} ${f(y)} l1.5 3 l1.5 -3 M${f(x - 1)} ${f(y)} l1.5 3 l1.5 -3 M${f(x + 2)} ${f(y)} l1.5 3 l1.5 -3" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" fill="#fff"/>`)
    .join("");

/** Arms out to the sides from a body of radius r around (C, cy). */
const arms = (cy: number, r: number, p: Pal, up = false, w = 6) =>
  limb(`M${f(C - r + 4)} ${f(cy + 4)} q-8 ${up ? -8 : 6} -12 ${up ? -14 : 4}`, p, w) +
  limb(`M${f(C + r - 4)} ${f(cy + 4)} q8 ${up ? -8 : 6} 12 ${up ? -14 : 4}`, p, w);

const ears = (cy: number, r: number, p: Pal, h = 12, spread = 12, w = 6) =>
  solid(
    `M${f(C - spread - w)} ${f(cy - r + 8)} L${f(C - spread)} ${f(cy - r - h)} L${f(C - spread + w)} ${f(cy - r + 4)} Z M${f(C + spread - w)} ${f(cy - r + 4)} L${f(C + spread)} ${f(cy - r - h)} L${f(C + spread + w)} ${f(cy - r + 8)} Z`,
    p,
  );

const horns = (cy: number, r: number, p: Pal, h = 12, spread = 11) =>
  solid(
    `M${f(C - spread - 4)} ${f(cy - r + 6)} Q${f(C - spread - 6)} ${f(cy - r - h * 0.5)} ${f(C - spread - 10)} ${f(cy - r - h)} Q${f(C - spread - 2)} ${f(cy - r - h * 0.6)} ${f(C - spread + 3)} ${f(cy - r + 3)} Z M${f(C + spread + 4)} ${f(cy - r + 6)} Q${f(C + spread + 6)} ${f(cy - r - h * 0.5)} ${f(C + spread + 10)} ${f(cy - r - h)} Q${f(C + spread + 2)} ${f(cy - r - h * 0.6)} ${f(C + spread - 3)} ${f(cy - r + 3)} Z`,
    p,
  );

const tail = (cy: number, r: number, p: Pal, d?: string, w = 6) =>
  limb(d ?? `M${f(C + r - 6)} ${f(cy + r * 0.6)} q14 4 14 -10 q0 -8 -6 -10`, p, w);

/** Bat / dragon wings behind the body. */
const wings = (cy: number, r: number, p: Pal, span = 26, o = 1) =>
  `<path d="M${f(C - r + 6)} ${f(cy - 4)} L${f(C - r - span)} ${f(cy - 24)} L${f(C - r - span + 8)} ${f(cy - 8)} L${f(C - r - span - 2)} ${f(cy + 4)} L${f(C - r - span + 12)} ${f(cy + 2)} L${f(C - r - span + 10)} ${f(cy + 14)} Z M${f(C + r - 6)} ${f(cy - 4)} L${f(C + r + span)} ${f(cy - 24)} L${f(C + r + span - 8)} ${f(cy - 8)} L${f(C + r + span + 2)} ${f(cy + 4)} L${f(C + r + span - 12)} ${f(cy + 2)} L${f(C + r + span - 10)} ${f(cy + 14)} Z" fill="${p.fill}" stroke="${p.edge}" stroke-width="2" stroke-linejoin="round" opacity="${o}"/>` +
  `<path d="M${f(C - r + 6)} ${f(cy - 4)} L${f(C - r - span + 8)} ${f(cy - 8)} M${f(C - r + 6)} ${f(cy - 4)} L${f(C - r - span + 12)} ${f(cy + 2)} M${f(C + r - 6)} ${f(cy - 4)} L${f(C + r + span - 8)} ${f(cy - 8)} M${f(C + r - 6)} ${f(cy - 4)} L${f(C + r + span - 12)} ${f(cy + 2)}" stroke="${p.edge}" stroke-width="1.2" opacity="0.7"/>`;

/** Insect wings: translucent ovals. */
const bugWings = (cy: number, r: number, p: Pal, big = false) => {
  const w = big ? 14 : 11;
  const h = big ? 7 : 6;
  const one = (x: number, y: number, rot: number) =>
    `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${w}" ry="${h}" fill="${p.edge}" opacity="0.35" transform="rotate(${rot} ${f(x)} ${f(y)})"/><ellipse cx="${f(x)}" cy="${f(y)}" rx="${w}" ry="${h}" fill="none" stroke="${p.edge}" stroke-width="1.5" opacity="0.8" transform="rotate(${rot} ${f(x)} ${f(y)})"/>`;
  return (
    one(C - r - w * 0.6, cy - 10, -28) +
    one(C + r + w * 0.6, cy - 10, 28) +
    (big ? one(C - r - w * 0.5, cy + 6, -10) + one(C + r + w * 0.5, cy + 6, 10) : "")
  );
};

const sparkle = (x: number, y: number, s: number, color: string, o = 0.9) =>
  `<path d="M${f(x)} ${f(y - s)} L${f(x + s * 0.3)} ${f(y - s * 0.3)} L${f(x + s)} ${f(y)} L${f(x + s * 0.3)} ${f(y + s * 0.3)} L${f(x)} ${f(y + s)} L${f(x - s * 0.3)} ${f(y + s * 0.3)} L${f(x - s)} ${f(y)} L${f(x - s * 0.3)} ${f(y - s * 0.3)} Z" fill="${color}" opacity="${o}"/>`;

// ---- Faces --------------------------------------------------------------

const eyesStage1 = (eyeY: number, off: number) =>
  `<circle cx="${f(C - off)}" cy="${f(eyeY)}" r="2.5" fill="${INK}"/><circle cx="${f(C + off)}" cy="${f(eyeY)}" r="2.5" fill="${INK}"/>`;

/** Big round creature eyes with a highlight, and a small open mouth. */
function eyesStage2(eyeY: number, off: number, edge: string): string {
  const eye = (x: number) =>
    `<ellipse cx="${f(x)}" cy="${f(eyeY)}" rx="4" ry="5" fill="${INK}"/><circle cx="${f(x + 1.3)}" cy="${f(eyeY - 2)}" r="1.6" fill="#fff"/><circle cx="${f(x - 1.2)}" cy="${f(eyeY + 2)}" r="0.8" fill="#fff" opacity="0.7"/>`;
  return (
    eye(C - off) +
    eye(C + off) +
    `<path d="M${f(C - 3)} ${f(eyeY + 9)} q3 4 6 0 z" fill="${INK}"/>` +
    `<path d="M${f(C - off - 4)} ${f(eyeY - 7)} q4 -2 8 -1 M${f(C + off + 4)} ${f(eyeY - 7)} q-4 -2 -8 -1" stroke="${edge}" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.8"/>`
  );
}

/** Confident half-lidded eyes: the stage-2 almond with a straight lid, and a fanged grin. */
function eyesStage3(eyeY: number, off: number, edge: string, fill: string): string {
  const eye = (x: number, dir: 1 | -1) =>
    // Almond with the top cut flat and tilted: the outer corner sits higher.
    `<path d="M${f(x - 5.5 * dir)} ${f(eyeY + 1.5)} L${f(x + 5.5 * dir)} ${f(eyeY - 2.5)} Q${f(x + 4 * dir)} ${f(eyeY + 5)} ${f(x)} ${f(eyeY + 5)} Q${f(x - 4.5 * dir)} ${f(eyeY + 5)} ${f(x - 5.5 * dir)} ${f(eyeY + 1.5)} Z" fill="${INK}"/>` +
    `<ellipse cx="${f(x + 1 * dir)}" cy="${f(eyeY + 2)}" rx="1.8" ry="2" fill="${fill}" opacity="0.9"/>` +
    `<circle cx="${f(x + 2.2 * dir)}" cy="${f(eyeY + 0.6)}" r="1.1" fill="#fff"/>`;
  return (
    eye(C - off, -1) +
    eye(C + off, 1) +
    `<path d="M${f(C - 7)} ${f(eyeY + 10)} Q${f(C)} ${f(eyeY + 17)} ${f(C + 7)} ${f(eyeY + 10)} Z" fill="${INK}"/>` +
    `<path d="M${f(C - 4.5)} ${f(eyeY + 11)} l1.3 3 l1.3 -2.6 M${f(C + 1.9)} ${f(eyeY + 11.4)} l1.3 2.6 l1.3 -3" fill="#fff" stroke="#fff" stroke-width="0.6" stroke-linejoin="round"/>` +
    `<path d="M${f(C - off - 5)} ${f(eyeY - 6)} l4 -1.5 M${f(C + off + 5)} ${f(eyeY - 6)} l-4 -1.5" stroke="${edge}" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>`
  );
}

const eyesNapping = (eyeY: number, off: number) =>
  `<path d="M${f(C - off - 3.5)} ${f(eyeY)} q3.5 2.5 7 0" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M${f(C + off - 3.5)} ${f(eyeY)} q3.5 2.5 7 0" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;

// ---- Surface detail, drawn on the body at every stage ------------------

function detail(shape: string, stage: 1 | 2 | 3, p: Pal, r: number, cy: number): string {
  switch (shape) {
    case "leaf":
      return `<path d="M${f(C)} ${f(cy - r * 0.9)} V${f(cy + r * 0.9)} M${f(C)} ${f(cy - r * 0.2)} l${f(r * 0.5)} ${f(-r * 0.35)} M${f(C)} ${f(cy + r * 0.3)} l${f(-r * 0.5)} ${f(-r * 0.35)}" stroke="${p.edge}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.7"/>`;
    case "mushroom":
      return (
        `<circle cx="${f(C - r * 0.6)}" cy="${f(cy - r * 0.45)}" r="${f(r * 0.22)}" fill="${p.edge}" opacity="0.8"/><circle cx="${f(C + r * 0.35)}" cy="${f(cy - r * 0.7)}" r="${f(r * 0.16)}" fill="${p.edge}" opacity="0.8"/><circle cx="${f(C + r * 0.8)}" cy="${f(cy - r * 0.2)}" r="${f(r * 0.14)}" fill="${p.edge}" opacity="0.8"/>` +
        dark(`M${f(C - r * 0.5)} ${f(cy + r * 0.1)} h${f(r)} v${f(r * 0.95)} a${f(r * 0.5)} ${f(r * 0.25)} 0 0 1 ${f(-r)} 0 Z`, 0.18)
      );
    case "skull":
      return `<path d="M${f(C - r * 0.3)} ${f(cy + r * 0.65)} v${f(r * 0.3)} M${f(C)} ${f(cy + r * 0.65)} v${f(r * 0.3)} M${f(C + r * 0.3)} ${f(cy + r * 0.65)} v${f(r * 0.3)}" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/><path d="M${f(C)} ${f(cy + r * 0.2)} l${f(-r * 0.12)} ${f(r * 0.2)} h${f(r * 0.24)} Z" fill="${INK}" opacity="0.6"/>`;
    case "cactus":
      return `<path d="${[-0.3, 0, 0.3].map((k) => `M${f(C + r * k)} ${f(cy - r * 0.3)} V${f(cy + r * 0.9)}`).join(" ")}" stroke="${INK}" stroke-width="1" stroke-dasharray="1.5 3" opacity="0.5"/>`;
    case "flake":
      return `<path d="${[0, 1, 2].map((i) => { const a = (i * Math.PI) / 3; const x = r * 0.9 * Math.cos(a); const y = r * 0.9 * Math.sin(a); return `M${f(C - x)} ${f(cy - y)} L${f(C + x)} ${f(cy + y)}`; }).join(" ")}" stroke="#fff" stroke-width="1.2" opacity="0.45"/>`;
    case "octo":
      return `<circle cx="${f(C - r * 0.45)}" cy="${f(cy + r * 0.75)}" r="1.4" fill="${p.edge}" opacity="0.8"/><circle cx="${f(C + r * 0.05)}" cy="${f(cy + r * 0.85)}" r="1.4" fill="${p.edge}" opacity="0.8"/><circle cx="${f(C + r * 0.55)}" cy="${f(cy + r * 0.75)}" r="1.4" fill="${p.edge}" opacity="0.8"/>`;
    case "bolt":
      return stage === 1 ? "" : `<path d="M${f(C + r * 0.3)} ${f(cy - r * 1.0)} L${f(C + r * 0.05)} ${f(cy - r * 0.3)}" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.6"/>`;
    case "heart":
      return `<path d="M${f(C - r * 0.75)} ${f(cy - r * 0.5)} q${f(r * 0.1)} ${f(-r * 0.35)} ${f(r * 0.4)} ${f(-r * 0.35)}" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.55"/>`;
    case "flame":
      return `<path d="${flamePath(r * 0.55, C, cy + r * 0.45)}" fill="#fff59d" opacity="0.55"/>`;
    case "pad":
      return (
        `<path d="M${f(C - r * 0.75)} ${f(cy - r * 0.25)} v${f(r * 0.5)} M${f(C - r)} ${f(cy)} h${f(r * 0.5)}" stroke="${INK}" stroke-width="${f(r * 0.16)}" stroke-linecap="round" opacity="0.55"/>` +
        [[0.65, -0.22], [0.85, 0], [0.65, 0.22], [1.05, 0]].map(([kx, ky]) => `<circle cx="${f(C + r * kx)}" cy="${f(cy + r * ky)}" r="${f(r * 0.08)}" fill="${INK}" opacity="0.55"/>`).join("")
      );
    case "rocket":
      return (
        `<path d="M${f(C - r * 0.6)} ${f(cy + r * 0.25)} L${f(C - r * 1.15)} ${f(cy + r * 1.05)} L${f(C - r * 0.6)} ${f(cy + r * 0.95)} Z M${f(C + r * 0.6)} ${f(cy + r * 0.25)} L${f(C + r * 1.15)} ${f(cy + r * 1.05)} L${f(C + r * 0.6)} ${f(cy + r * 0.95)} Z" fill="#ef4444" stroke="#fca5a5" stroke-width="1.5" stroke-linejoin="round"/>` +
        `<path d="M${f(C - r * 0.35)} ${f(cy + r * 0.95)} q${f(r * 0.35)} ${f(r * 0.9)} ${f(r * 0.7)} 0 Z" fill="#fb923c"/><path d="M${f(C - r * 0.18)} ${f(cy + r * 0.95)} q${f(r * 0.18)} ${f(r * 0.5)} ${f(r * 0.36)} 0 Z" fill="#fde68a"/>` +
        `<circle cx="${f(C)}" cy="${f(cy - r * 0.15)}" r="${f(r * 0.5)}" fill="none" stroke="${p.edge}" stroke-width="1.5" opacity="0.7"/>`
      );
    case "penguin":
      return (
        `<ellipse cx="${f(C)}" cy="${f(cy + r * 0.3)}" rx="${f(r * 0.62)}" ry="${f(r * 0.72)}" fill="#f8fafc"/>` +
        `<path d="M${f(C - r * 0.18)} ${f(cy + r * 0.12)} h${f(r * 0.36)} l${f(-r * 0.18)} ${f(r * 0.22)} Z" fill="#fb923c"/>` +
        `<ellipse cx="${f(C - r * 0.4)}" cy="${f(cy + r * 1.12)}" rx="${f(r * 0.28)}" ry="${f(r * 0.1)}" fill="#fb923c"/><ellipse cx="${f(C + r * 0.4)}" cy="${f(cy + r * 1.12)}" rx="${f(r * 0.28)}" ry="${f(r * 0.1)}" fill="#fb923c"/>`
      );
    case "dino":
      return [[-0.5, 0.2, 0.14], [0.45, 0.35, 0.12], [0.1, 0.65, 0.1], [-0.35, 0.6, 0.08]].map(([kx, ky, ks]) => `<circle cx="${f(C + r * kx)}" cy="${f(cy + r * ky)}" r="${f(r * ks)}" fill="${INK}" opacity="0.18"/>`).join("");
    case "fish":
      return `<path d="M${f(C + r * 0.1)} ${f(cy - r * 0.45)} q${f(r * 0.3)} ${f(r * 0.45)} 0 ${f(r * 0.9)} M${f(C + r * 0.4)} ${f(cy - r * 0.35)} q${f(r * 0.25)} ${f(r * 0.35)} 0 ${f(r * 0.7)}" stroke="${p.edge}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.7"/>`;
    case "bot":
      return `<path d="M${f(C)} ${f(cy - r)} v${f(-r * 0.4)}" stroke="${p.edge}" stroke-width="2" stroke-linecap="round"/><circle cx="${f(C)}" cy="${f(cy - r * 1.5)}" r="${f(r * 0.14)}" fill="${p.edge}"/><path d="M${f(C - r * 0.5)} ${f(cy + r * 0.55)} h${f(r)}" stroke="${INK}" stroke-width="${f(r * 0.1)}" stroke-linecap="round" opacity="0.5" stroke-dasharray="${f(r * 0.12)} ${f(r * 0.1)}"/>`;
    case "crown":
      return [[-0.85, 0.35], [0, 0.4], [0.85, 0.35]].map(([kx, ky], i) => `<circle cx="${f(C + r * kx)}" cy="${f(cy + r * ky)}" r="${f(r * (i === 1 ? 0.16 : 0.12))}" fill="${["#ef4444", "#3b82f6", "#22c55e"][i]}" stroke="#fff" stroke-width="1" opacity="0.95"/>`).join("") + `<path d="M${f(C - r * 1.1)} ${f(cy + r * 0.6)} h${f(r * 2.2)}" stroke="${INK}" stroke-width="1.5" opacity="0.3"/>`;
    case "shield":
      return `<path d="M${f(C)} ${f(cy - r * 0.95)} V${f(cy + r * 1.15)} M${f(C - r)} ${f(cy + r * 0.05)} H${f(C + r)}" stroke="${p.edge}" stroke-width="1.5" opacity="0.5"/>` + [[-0.75, -0.7], [0.75, -0.7], [-0.75, 0.3], [0.75, 0.3]].map(([kx, ky]) => `<circle cx="${f(C + r * kx)}" cy="${f(cy + r * ky)}" r="1.3" fill="${p.edge}" opacity="0.9"/>`).join("");
    default:
      return "";
  }
}

// ---- Species ------------------------------------------------------------

type Layers = { back: string; front: string; r?: number; cy?: number; eyeY?: number };

/**
 * Per species, what goes behind and in front of the body. `r`/`cy` can
 * shift the body for the pose (a stage-3 body sits higher to leave room
 * for legs).
 */
function creature(shape: string, stage: 2 | 3, p: Pal): Layers {
  const r = stage === 2 ? 22 : 26;
  const cy = stage === 2 ? 54 : 50;
  const bottom = cy + r;
  const top = cy - r;

  switch (shape) {
    // Pentagon — the house pet. Fox-ish: pointed ears, bushy tail, by
    // stage 3 a crown of spikes, shoulder plates and claws.
    case "pent": {
      if (stage === 2) {
        return {
          back: ears(cy, r, p, 14, 11, 6) + tail(cy, r, p, `M${f(C + r - 8)} ${f(cy + 10)} q16 2 14 -14`, 7) + legs(bottom - 6, p, 9, 10),
          front: arms(cy, r, p) + light(polyPath(5, r * 0.45, -Math.PI / 2, C, cy + 8), p, 0.4),
        };
      }
      const crown = `M${f(C - 17)} ${f(top + 10)} L${f(C - 20)} ${f(top - 6)} L${f(C - 9)} ${f(top + 2)} L${f(C)} ${f(top - 13)} L${f(C + 9)} ${f(top + 2)} L${f(C + 20)} ${f(top - 6)} L${f(C + 17)} ${f(top + 10)} Z`;
      return {
        back:
          solid(crown, p) +
          tail(cy, r, p, `M${f(C + r - 8)} ${f(cy + 12)} q22 6 20 -16 q-1 -8 -8 -10`, 8) +
          solid(polyPath(5, 5, -Math.PI / 2, C + r + 12, cy - 14), p) +
          legs(bottom - 8, p, 11, 12, 8) +
          claws(bottom + 5, 11),
        front:
          arms(cy, r, p, false, 7) +
          solid(polyPath(5, 7, -Math.PI / 2, C - r + 2, cy - 6), p) +
          solid(polyPath(5, 7, -Math.PI / 2, C + r - 2, cy - 6), p) +
          light(polyPath(5, r * 0.4, -Math.PI / 2, C, cy + 9), p, 0.45) +
          `<path d="${polyPath(5, r * 0.2, -Math.PI / 2, C, cy + 9)}" fill="#fff" opacity="0.8"/>`,
      };
    }

    // Blip — round and bouncy. Antenna, flipper arms; stage 3 is a
    // little planet with a ring and moons, big fins.
    case "circle": {
      if (stage === 2) {
        return {
          back:
            `<path d="M${f(C)} ${f(top + 2)} q-3 -8 3 -13" stroke="${p.edge}" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="${f(C + 4)}" cy="${f(top - 12)}" r="3.5" fill="${p.fill}" stroke="${p.edge}" stroke-width="1.5"/>` +
            legs(bottom - 6, p, 8, 8),
          front: arms(cy, r, p, false, 7) + light(circlePath(r * 0.5, C - 4, cy + 6), p, 0.3),
        };
      }
      const rx = r * 1.6;
      const ry = r * 0.4;
      const fin = (dir: 1 | -1) =>
        solid(`M${f(C + dir * (r - 6))} ${f(cy - 2)} Q${f(C + dir * (r + 22))} ${f(cy - 18)} ${f(C + dir * (r + 18))} ${f(cy + 6)} Q${f(C + dir * (r + 8))} ${f(cy + 14)} ${f(C + dir * (r - 4))} ${f(cy + 10)} Z`, p);
      return {
        back:
          `<path d="M${f(C - rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 0 1 ${f(C + rx)} ${f(cy)}" stroke="${p.edge}" stroke-width="4" fill="none" opacity="0.9"/>` +
          `<circle cx="${f(C - 32)}" cy="${f(cy - 26)}" r="4" fill="${p.fill}" stroke="${p.edge}" stroke-width="1.5"/><circle cx="${f(C + 38)}" cy="${f(cy - 14)}" r="2.5" fill="${p.edge}"/>` +
          `<path d="M${f(C - 6)} ${f(top + 2)} q-4 -10 2 -14 M${f(C + 6)} ${f(top + 2)} q4 -10 -2 -14" stroke="${p.edge}" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="${f(C - 4)}" cy="${f(top - 13)}" r="3.5" fill="${p.fill}" stroke="${p.edge}" stroke-width="1.5"/><circle cx="${f(C + 4)}" cy="${f(top - 13)}" r="3.5" fill="${p.fill}" stroke="${p.edge}" stroke-width="1.5"/>` +
          fin(-1) + fin(1) +
          legs(bottom - 8, p, 9, 10, 8),
        front:
          `<path d="M${f(C - rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 0 0 ${f(C + rx)} ${f(cy)}" stroke="${p.edge}" stroke-width="4" fill="none"/>` +
          `<path d="M${f(C - rx + 2)} ${f(cy + 1)} A${f(rx - 2)} ${f(ry - 2)} 0 0 0 ${f(C + rx - 2)} ${f(cy + 1)}" stroke="${p.fill}" stroke-width="1.5" fill="none" opacity="0.8"/>` +
          light(circlePath(r * 0.45, C - 5, cy + 8), p, 0.25),
      };
    }

    // Cube — a blocky golem. Isometric top face, block limbs; stage 3
    // gets shoulder blocks, big fists and glowing seams.
    case "square": {
      const k = r / Math.SQRT2;
      const topFace = `M${f(C - k)} ${f(cy - k)} L${f(C - k + 7)} ${f(cy - k - 7)} L${f(C + k + 7)} ${f(cy - k - 7)} L${f(C + k)} ${f(cy - k)} Z`;
      const sideFace = `M${f(C + k)} ${f(cy - k)} L${f(C + k + 7)} ${f(cy - k - 7)} L${f(C + k + 7)} ${f(cy + k - 7)} L${f(C + k)} ${f(cy + k)} Z`;
      const iso = `<path d="${topFace}" fill="${p.edge}" stroke="${p.edge}" stroke-width="2" stroke-linejoin="round"/><path d="${sideFace}" fill="${p.fill}" stroke="${p.edge}" stroke-width="2" stroke-linejoin="round"/>${dark(sideFace, 0.35)}`;
      const block = (x: number, y: number, s: number) =>
        `<rect x="${f(x - s)}" y="${f(y - s)}" width="${f(2 * s)}" height="${f(2 * s)}" fill="${p.fill}" stroke="${p.edge}" stroke-width="2" stroke-linejoin="round"/><path d="M${f(x - s)} ${f(y - s)} l3 -3 h${f(2 * s)} l-3 3 Z" fill="${p.edge}"/>`;
      if (stage === 2) {
        return {
          back: iso + block(C - 12, bottom + 2, 5) + block(C + 12, bottom + 2, 5) + `<path d="M${f(C + 2)} ${f(top - 6)} v-8" stroke="${p.edge}" stroke-width="2" stroke-linecap="round"/><circle cx="${f(C + 2)}" cy="${f(top - 16)}" r="2.5" fill="${p.edge}"/>`,
          front: block(C - k - 4, cy + 6, 5) + block(C + k + 4, cy + 6, 5),
        };
      }
      return {
        back:
          iso +
          block(C - k - 7, cy - k + 4, 7) + block(C + k + 9, cy - k + 2, 7) +
          block(C - 13, bottom + 4, 6) + block(C + 13, bottom + 4, 6) +
          `<path d="M${f(C - 4)} ${f(top - 6)} v-8 M${f(C + 8)} ${f(top - 6)} v-6" stroke="${p.edge}" stroke-width="2" stroke-linecap="round"/><circle cx="${f(C - 4)}" cy="${f(top - 16)}" r="2.5" fill="${p.edge}"/><circle cx="${f(C + 8)}" cy="${f(top - 14)}" r="2" fill="${p.edge}"/>`,
        front:
          block(C - k - 9, cy + 12, 6) + block(C + k + 11, cy + 12, 6) +
          `<path d="M${f(C - k + 3)} ${f(cy + 8)} h7 v6 h7 M${f(C + k - 3)} ${f(cy + 6)} h-6 v8" stroke="${p.edge}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.9"/>` +
          `<circle cx="${f(C - k + 17)}" cy="${f(cy + 14)}" r="1.6" fill="#fff"/><circle cx="${f(C + k - 9)}" cy="${f(cy + 14)}" r="1.6" fill="#fff"/>`,
      };
    }

    // Spike — pointy and proud. Horns and clawed feet; stage 3 is a
    // small dragon: bat wings, flame aura, spiked tail.
    case "tri": {
      if (stage === 2) {
        return {
          back:
            horns(cy, r, p, 10, 8) +
            tail(cy, r, p, `M${f(C + r * 0.7)} ${f(bottom - 8)} q14 0 12 -14`, 6) +
            solid(`M${f(C + r * 0.7 + 10)} ${f(bottom - 22)} l2 -8 l4 7 Z`, p) +
            legs(bottom - 6, p, 9, 9) + claws(bottom + 4, 9),
          front: arms(cy, r, p, false, 6) + light(polyPath(3, r * 0.45, -Math.PI / 2, C, cy + 12), p, 0.4),
        };
      }
      return {
        back:
          wings(cy, r - 6, p, 22) +
          horns(cy, r, p, 16, 10) +
          tail(cy, r, p, `M${f(C + r * 0.6)} ${f(bottom - 10)} q22 2 20 -20 q-1 -8 -8 -10`, 7) +
          solid(`M${f(C + r * 0.6 + 14)} ${f(bottom - 36)} l0 -12 l8 8 Z`, p) +
          legs(bottom - 8, p, 11, 11, 8) + claws(bottom + 4, 11),
        front: arms(cy, r, p, true, 7) + light(polyPath(3, r * 0.45, -Math.PI / 2, C, cy + 14), p, 0.45),
      };
    }

    // Gem — shiny and vain. Crystal ears, facets; stage 3 is a crystal
    // beast: shard shoulders, shard tail, floating shards.
    case "gem": {
      const facets = `<path d="${polyPts(4, r, 0, C, cy).map((q) => `M${f(C)} ${f(cy)} L${f(q[0])} ${f(q[1])}`).join(" ")} M${f(C - r * 0.5)} ${f(cy)} L${f(C)} ${f(cy - r * 0.5)} L${f(C + r * 0.5)} ${f(cy)} L${f(C)} ${f(cy + r * 0.5)} Z" stroke="${p.edge}" stroke-width="1.2" fill="none" opacity="0.7"/>`;
      const shard = (x: number, y: number, h: number, w: number, tilt: number) =>
        `<path d="M${f(x)} ${f(y - h)} L${f(x + w)} ${f(y - h * 0.35)} L${f(x + w * 0.6)} ${f(y)} L${f(x - w * 0.6)} ${f(y)} L${f(x - w)} ${f(y - h * 0.35)} Z" fill="${p.fill}" stroke="${p.edge}" stroke-width="1.5" stroke-linejoin="round" transform="rotate(${tilt} ${f(x)} ${f(y)})"/>`;
      if (stage === 2) {
        return {
          back: shard(C - 12, top + 10, 14, 4, -20) + shard(C + 12, top + 10, 14, 4, 20) + legs(bottom - 6, p, 8, 8),
          front: arms(cy, r, p, false, 6) + facets + sparkle(C + r * 0.5, cy - r * 0.5, 4, "#fff"),
        };
      }
      return {
        back:
          shard(C - 10, top + 12, 20, 5, -24) + shard(C + 10, top + 12, 20, 5, 24) + shard(C, top + 8, 16, 4, 0) +
          shard(C - r - 4, cy + 2, 18, 6, -60) + shard(C + r + 4, cy + 2, 18, 6, 60) +
          shard(C + r + 8, bottom - 4, 22, 6, 110) +
          shard(C - 42, cy - 18, 9, 3, -20) + shard(C + 42, cy - 10, 8, 3, 15) +
          legs(bottom - 8, p, 10, 11, 8),
        front: arms(cy, r, p, false, 6) + facets + sparkle(C + r * 0.5, cy - r * 0.5, 5, "#fff") + sparkle(C - r * 0.5, cy + r * 0.3, 3, "#fff", 0.8) + sparkle(C - 44, cy + 10, 3, p.edge),
      };
    }

    // Hex — busy, builds things. A bug: antennae, wings; stage 3 has
    // four wings, a stinger and honeycomb armour.
    case "hex": {
      const cells = (cx: number, cy2: number, s: number) =>
        [0, 1, 2].map((i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
          return light(polyPath(6, s, 0, cx + s * 1.75 * Math.cos(a), cy2 + s * 1.75 * Math.sin(a)), p, 0.35);
        }).join("");
      const antennae = `<path d="M${f(C - 6)} ${f(top + 2)} q-6 -8 -12 -10 M${f(C + 6)} ${f(top + 2)} q6 -8 12 -10" stroke="${p.edge}" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="${f(C - 18)}" cy="${f(top - 8)}" r="2.5" fill="${p.edge}"/><circle cx="${f(C + 18)}" cy="${f(top - 8)}" r="2.5" fill="${p.edge}"/>`;
      if (stage === 2) {
        return { back: bugWings(cy, r, p) + antennae + legs(bottom - 6, p, 8, 8), front: arms(cy, r, p, false, 5) + cells(C, cy + 8, 4.5) };
      }
      return {
        back:
          bugWings(cy, r, p, true) + antennae +
          solid(`M${f(C + r - 6)} ${f(bottom - 10)} q16 4 22 -4 l-4 -4 q-4 4 -14 0 Z`, p) +
          legs(bottom - 8, p, 10, 10, 7) + limb(`M${f(C - r + 2)} ${f(bottom - 14)} l-10 8`, p, 5) + limb(`M${f(C + r - 2)} ${f(bottom - 14)} l10 8`, p, 5),
        front: arms(cy, r, p, true, 6) + cells(C, cy + 10, 5.5) + `<path d="${polyPath(6, r + 1, 0, C, cy)}" fill="none" stroke="${p.edge}" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>`,
      };
    }

    // Blob — squishy, hugs back. Nub ears, drips, little arms; stage 3
    // is a big goo with tentacle arms and a buddy riding on top.
    case "blob": {
      const bubble = (x: number, y: number, s: number) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" fill="none" stroke="${p.edge}" stroke-width="1.5" opacity="0.8"/>`;
      const drips = solid(`M${f(C - 12)} ${f(bottom - 4)} q-2 10 2 12 q4 -2 2 -12 M${f(C + 10)} ${f(bottom - 6)} q-1 8 3 10 q3 -3 1 -10`, p);
      const nubs = solid(`M${f(C - 14)} ${f(top + 8)} q-2 -12 6 -8 Z M${f(C + 14)} ${f(top + 8)} q2 -12 -6 -8 Z`, p);
      if (stage === 2) {
        return { back: nubs + bubble(C + r + 6, cy - 10, 3) + bubble(C + r + 12, cy - 20, 2) + legs(bottom - 6, p, 8, 6, 8), front: drips + arms(cy, r, p, false, 7) };
      }
      return {
        back:
          nubs + bubble(C - r - 8, cy - 14, 3.5) + bubble(C + r + 8, cy - 18, 2.5) + bubble(C + r + 14, cy - 28, 2) + bubble(C - r - 14, cy - 2, 2) +
          limb(`M${f(C - r + 6)} ${f(cy + 6)} q-16 2 -18 -14 q-1 -6 4 -8`, p, 7) + limb(`M${f(C + r - 6)} ${f(cy + 6)} q16 2 18 -14 q1 -6 -4 -8`, p, 7) +
          legs(bottom - 8, p, 10, 7, 9),
        front:
          drips +
          `<path d="${blobPath(8, C + 12, top + 1)}" fill="${p.fill}" stroke="${p.edge}" stroke-width="1.5"/><circle cx="${f(C + 9)}" cy="${f(top)}" r="1.4" fill="${INK}"/><circle cx="${f(C + 15)}" cy="${f(top)}" r="1.4" fill="${INK}"/>`,
      };
    }

    // Star — bright, shows off. Points become limbs; stage 3 is a
    // comet: a trail, a bigger back-star and flame tips.
    case "star": {
      if (stage === 2) {
        return {
          back: sparkle(C - r - 8, cy - 14, 4, p.edge) + sparkle(C + r + 6, cy + 10, 3, p.edge) + legs(bottom - 10, p, 9, 8, 6),
          front: light(starPath(r * 0.45, C, cy + 5), p, 0.45) + `<path d="M${f(C - r + 4)} ${f(cy + 2)} q-8 4 -10 10 M${f(C + r - 4)} ${f(cy + 2)} q8 4 10 10" stroke="${p.edge}" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M${f(C - r + 4)} ${f(cy + 2)} q-8 4 -10 10 M${f(C + r - 4)} ${f(cy + 2)} q8 4 10 10" stroke="${p.fill}" stroke-width="2.5" stroke-linecap="round" fill="none"/>`,
        };
      }
      return {
        back:
          `<path d="M${f(C - 8)} ${f(cy + 2)} L${f(C - 48)} ${f(cy + 34)} L${f(C - 6)} ${f(cy + 14)} Z" fill="${p.edge}" opacity="0.35"/><path d="M${f(C - 6)} ${f(cy - 2)} L${f(C - 46)} ${f(cy + 20)} L${f(C - 4)} ${f(cy + 10)} Z" fill="${p.fill}" opacity="0.5"/>` +
          `<path d="${starPath(r + 7, C, cy, 0.42)}" fill="${p.edge}" opacity="0.4" transform="rotate(18 ${C} ${cy})"/>` +
          arms(cy, r - 6, p, true, 6) +
          sparkle(C + r + 4, cy - r + 2, 5, "#fff") + sparkle(C - 30, cy + 28, 3, "#fff", 0.8) + sparkle(C + r + 12, cy + 12, 3, p.edge) +
          legs(bottom - 12, p, 10, 9, 7),
        front: light(starPath(r * 0.42, C, cy + 6), p, 0.5) + `<path d="${starPath(r * 0.2, C, cy + 6)}" fill="#fff" opacity="0.8"/>`,
      };
    }

    // Drop — calm, goes with the flow. A tadpole: fins and a puddle;
    // stage 3 a wave-maned sea creature with a fish tail.
    case "drop": {
      const ripple = (ry: number, o: number) => `<ellipse cx="${f(C)}" cy="${f(bottom + 6)}" rx="${f(ry * 2.4)}" ry="${f(ry * 0.5)}" fill="none" stroke="${p.edge}" stroke-width="1.5" opacity="${o}"/>`;
      const fin = (dir: 1 | -1, s: number) =>
        solid(`M${f(C + dir * (r - 8))} ${f(cy + 2)} Q${f(C + dir * (r + s))} ${f(cy - 6)} ${f(C + dir * (r + s - 2))} ${f(cy + 10)} Q${f(C + dir * (r + 2))} ${f(cy + 10)} ${f(C + dir * (r - 6))} ${f(cy + 8)} Z`, p);
      const shine = `<path d="M${f(C - 7)} ${f(cy - r * 0.6)} q-7 12 -3 24" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.6"/>`;
      if (stage === 2) {
        return { back: ripple(r * 0.6, 0.8) + ripple(r * 0.95, 0.4) + fin(-1, 12) + fin(1, 12) + legs(bottom - 4, p, 7, 5, 6), front: shine };
      }
      return {
        back:
          ripple(r * 0.6, 0.9) + ripple(r * 1.0, 0.5) + ripple(r * 1.4, 0.25) +
          solid(`M${f(C - 10)} ${f(top - 2)} C${f(C - 4)} ${f(top - 28)} ${f(C + 32)} ${f(top - 24)} ${f(C + 28)} ${f(top - 6)} C${f(C + 26)} ${f(top - 14)} ${f(C + 10)} ${f(top - 14)} ${f(C + 12)} ${f(top - 2)} Z`, p) +
          fin(-1, 20) + fin(1, 20) +
          solid(`M${f(C + 6)} ${f(bottom - 6)} q18 6 26 -8 l-4 14 l-4 -6 q-8 8 -18 4 Z`, p) +
          `<path d="${dropPath(4.5, C - r - 12, cy - 14)}" fill="${p.fill}" stroke="${p.edge}" stroke-width="1.5"/><path d="${dropPath(3, C - r - 6, cy + 14)}" fill="${p.edge}"/>` +
          legs(bottom - 6, p, 9, 6, 7),
        front: shine + `<path d="M${f(C - 2)} ${f(top + 10)} q6 -2 10 4" stroke="${p.edge}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.8"/>`,
      };
    }

    // Pill — chill, always napping. Nightcap and stubby limbs; stage 3
    // sleeps on a cloud under a crescent moon with a scarf.
    case "pill": {
      const band = `${dark(`M${f(C)} ${f(cy - r * 0.6)} h${f(r * 1.3)} a${f(r * 0.6)} ${f(r * 0.6)} 0 0 1 0 ${f(r * 1.2)} h${f(-r * 1.3)} Z`, 0.25)}<path d="M${f(C - r * 0.9)} ${f(cy - r * 0.25)} h${f(r * 0.5)}" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>`;
      const cap = (s: number) =>
        solid(`M${f(C - r * 0.9)} ${f(cy - r * 0.55)} Q${f(C - r * 0.6)} ${f(cy - r * 0.55 - s * 1.4)} ${f(C + r * 0.5)} ${f(cy - r * 0.55 - s * 1.2)} Q${f(C + r * 1.1)} ${f(cy - r * 0.55 - s)} ${f(C + r * 1.2)} ${f(cy - r * 0.55 - s * 0.2)} Q${f(C + r * 0.9)} ${f(cy - r * 0.55 - s * 0.6)} ${f(C + r * 0.3)} ${f(cy - r * 0.55 - s * 0.5)} Q${f(C - r * 0.4)} ${f(cy - r * 0.55 - s * 0.6)} ${f(C - r * 0.9)} ${f(cy - r * 0.55)} Z`, p) +
        `<circle cx="${f(C + r * 1.2)}" cy="${f(cy - r * 0.55 - s * 0.2)}" r="${f(s * 0.3)}" fill="${p.edge}" stroke="${p.fill}" stroke-width="1.5"/>`;
      if (stage === 2) {
        return { back: cap(10) + legs(bottom - 2, p, 10, 7, 7), front: band + arms(cy, r * 1.2, p, false, 6) };
      }
      const cloud = `<path d="M${f(C - 34)} ${f(bottom + 6)} a8 8 0 0 1 12 -9 a10 10 0 0 1 18 -4 a10 10 0 0 1 18 4 a8 8 0 0 1 12 9 Z" fill="${p.edge}" opacity="0.75"/>`;
      const moon = `<path d="M${f(C + 36)} ${f(cy - 34)} a9 9 0 1 0 8 14 a7 7 0 1 1 -8 -14 Z" fill="${p.edge}" opacity="0.9"/>`;
      const zz = `<text x="${f(C - 44)}" y="${f(cy - 22)}" font-family="sans-serif" font-weight="700" font-size="9" fill="${p.edge}">z</text><text x="${f(C - 38)}" y="${f(cy - 30)}" font-family="sans-serif" font-weight="700" font-size="7" fill="${p.edge}" opacity="0.7">z</text>`;
      const scarf = `<path d="M${f(C - r * 1.3)} ${f(cy + r * 0.3)} h${f(r * 2.6)}" stroke="${p.fill}" stroke-width="6" stroke-linecap="round"/><path d="M${f(C - r * 1.3)} ${f(cy + r * 0.3)} h${f(r * 2.6)}" stroke="${INK}" stroke-width="6" stroke-linecap="round" opacity="0.4"/><path d="M${f(C + r * 1.1)} ${f(cy + r * 0.3)} q6 8 2 16" stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.4"/>`;
      return { back: cloud + moon + zz + cap(11), front: band + scarf + arms(cy, r * 1.2, p, false, 6) };
    }

    // Moon — night owl. Bat ears, stars; stage 3 has bat wings, a star
    // crown and a long curling tail.
    case "crescent": {
      const stars = (n: number) => [[-r - 10, -14, 3], [r + 6, -22, 2.5], [r + 14, 4, 2], [-r - 16, 6, 2]].slice(0, n).map(([dx, dy, sz]) => sparkle(C + dx, cy + dy, sz, p.edge)).join("");
      const ear = solid(`M${f(C + 14)} ${f(top + 10)} L${f(C + 16)} ${f(top - 6)} L${f(C + 4)} ${f(top + 4)} Z`, p);
      if (stage === 2) return { back: ear + stars(2) + legs(bottom - 6, p, 8, 8), front: limb(`M${f(C + r - 2)} ${f(cy + 6)} q8 4 10 10`, p, 6) + sparkle(C - r * 0.4, cy - r * 0.2, 3, p.edge) };
      return {
        back: wings(cy, r - 8, p, 22) + ear + solid(`M${f(C + 2)} ${f(top + 6)} L${f(C - 2)} ${f(top - 10)} L${f(C - 8)} ${f(top + 2)} Z`, p) + stars(4) + tail(cy, r, p, `M${f(C + r - 2)} ${f(bottom - 12)} q18 6 16 -14 q0 -8 -6 -10`, 6) + legs(bottom - 8, p, 9, 10, 7) + claws(bottom + 3, 9),
        front: limb(`M${f(C + r - 4)} ${f(cy + 8)} q10 -4 12 -14`, p, 6) + sparkle(C - r * 0.5, cy - r * 0.3, 4, p.edge),
      };
    }

    // Bolt — hyper. Sparks and spiky hair; stage 3 crackles with arcs.
    case "bolt": {
      const arc = (x: number, y: number, dir: 1 | -1) => `<path d="M${f(x)} ${f(y)} l${f(4 * dir)} -3 l${f(-2 * dir)} -3 l${f(5 * dir)} -4" stroke="${p.edge}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      const hair = solid(`M${f(C - 6)} ${f(top + 2)} L${f(C - 10)} ${f(top - 10)} L${f(C - 2)} ${f(top - 4)} L${f(C + 2)} ${f(top - 14)} L${f(C + 6)} ${f(top - 4)} L${f(C + 12)} ${f(top - 10)} L${f(C + 10)} ${f(top + 2)} Z`, p);
      if (stage === 2) return { back: arc(C - r - 4, cy - 6, -1) + arc(C + r + 2, cy + 4, 1) + legs(bottom - 4, p, 8, 7), front: arms(cy, r - 4, p, true, 5) };
      return {
        back: `<circle cx="${C}" cy="${cy}" r="${r + 10}" fill="none" stroke="${p.edge}" stroke-width="1.5" stroke-dasharray="2 5" opacity="0.6"/>` + hair + arc(C - r - 8, cy - 10, -1) + arc(C + r + 4, cy + 6, 1) + arc(C - r - 2, cy + 14, -1) + arc(C + r + 8, cy - 14, 1) + legs(bottom - 6, p, 10, 9, 7) + claws(bottom + 5, 10),
        front: arms(cy, r - 4, p, true, 6) + sparkle(C + r * 0.5, cy - r * 1.0, 4, "#fff"),
      };
    }

    // Heart — soft, fierce about friends. Little wings; stage 3 gets big
    // feathered wings and a halo.
    case "heart": {
      const feather = (dir: 1 | -1, big: boolean) => {
        const w = big ? 22 : 12;
        return [0, 1, 2].map((i) => `<ellipse cx="${f(C + dir * (r + w * 0.55 + i * 2))}" cy="${f(cy - 8 + i * 7)}" rx="${f(w * 0.5)}" ry="${f(big ? 5 : 3.5)}" fill="#fff" stroke="${p.edge}" stroke-width="1.5" opacity="0.95" transform="rotate(${dir * (-30 + i * 14)} ${f(C + dir * (r + w * 0.55 + i * 2))} ${f(cy - 8 + i * 7)})"/>`).join("");
      };
      if (stage === 2) return { back: feather(-1, false) + feather(1, false) + legs(bottom - 6, p, 8, 8), front: arms(cy, r, p, false, 6) };
      return {
        back: feather(-1, true) + feather(1, true) + `<ellipse cx="${C}" cy="${f(top - 10)}" rx="12" ry="3.5" fill="none" stroke="${p.edge}" stroke-width="2.5"/>` + legs(bottom - 6, p, 9, 10, 7),
        front: arms(cy, r, p, false, 6) + sparkle(C + r * 0.9, cy - r * 0.6, 3.5, "#fff"),
      };
    }

    // Leaf — patient. A sprout on top; stage 3 wears a flower crown and
    // trails a vine.
    case "leaf": {
      const sprout = `<path d="M${f(C)} ${f(top - 2)} q0 -8 -2 -12" stroke="${p.edge}" stroke-width="2" fill="none" stroke-linecap="round"/>` + solid(leafPath(4, C - 6, top - 14), p) + solid(leafPath(3.5, C + 3, top - 11), p);
      const flower = (x: number, y: number, s: number) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 1.8)}" fill="#fff" opacity="0.9"/>${[0, 1, 2, 3, 4].map((i) => { const a = (i * 2 * Math.PI) / 5; return `<circle cx="${f(x + s * 1.3 * Math.cos(a))}" cy="${f(y + s * 1.3 * Math.sin(a))}" r="${f(s)}" fill="#fff" opacity="0.9"/>`; }).join("")}<circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 0.7)}" fill="${p.fill}"/>`;
      if (stage === 2) return { back: sprout + legs(bottom - 8, p, 7, 8), front: arms(cy, r, p, false, 5) };
      return {
        back: sprout + tail(cy, r, p, `M${f(C + r - 6)} ${f(bottom - 12)} q20 4 22 -14 q0 -8 -6 -10`, 4) + solid(leafPath(4, C + r + 16, bottom - 36), p) + legs(bottom - 8, p, 9, 10, 6),
        front: arms(cy, r, p, false, 5) + flower(C - r * 0.7, top + 8, 2.4) + flower(C + r * 0.6, top + 4, 2) + flower(C - 2, top - 2, 1.6),
      };
    }

    // Ghost — shy. Floats (no legs), a wisp trail; stage 3 has a crown
    // of wisps and tattered layers.
    case "ghost": {
      const wisp = (x: number, y: number, s: number) => `<path d="M${f(x)} ${f(y)} q${f(s)} ${f(-s)} 0 ${f(-2 * s)} q${f(-s)} ${f(-s)} 0 ${f(-2 * s)}" stroke="${p.edge}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.8"/>`;
      if (stage === 2) return { back: wisp(C + r + 6, cy + 10, 3) + wisp(C - r - 6, cy + 16, 2.5), front: arms(cy, r, p, true, 6) };
      return {
        back: `<path d="${ghostPath(r + 6, C, cy + 4)}" fill="${p.fill}" opacity="0.35"/>` + wisp(C - 8, top - 2, 4) + wisp(C + 6, top - 4, 5) + wisp(C + r + 8, cy + 6, 3) + wisp(C - r - 8, cy + 14, 3) + wisp(C + r + 14, cy - 10, 2.5),
        front: arms(cy, r, p, true, 7) + `<path d="M${f(C - r * 0.6)} ${f(cy + r * 0.3)} q${f(r * 0.6)} ${f(r * 0.3)} ${f(r * 1.2)} 0" stroke="${INK}" stroke-width="1.5" fill="none" opacity="0.3"/>`,
      };
    }

    // Mushroom — odd. Spots and spores; stage 3 has a huge cap, a
    // gill beard and little mushrooms at its feet.
    case "mushroom": {
      const spore = (x: number, y: number, s: number) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" fill="${p.edge}" opacity="0.6"/>`;
      const mini = (x: number, y: number, s: number) => solid(mushroomPath(s, x, y), p);
      if (stage === 2) return { back: spore(C - r - 8, cy - 14, 2) + spore(C + r + 6, cy - 20, 1.5) + legs(bottom - 2, p, 6, 6, 6), front: arms(cy + 10, r * 0.6, p, false, 5) };
      return {
        back: spore(C - r - 12, cy - 18, 2.5) + spore(C + r + 10, cy - 26, 2) + spore(C + r + 16, cy - 8, 1.5) + spore(C - r - 18, cy, 1.5) + mini(C - r - 6, bottom - 4, 5) + mini(C + r + 8, bottom - 2, 4) + legs(bottom - 2, p, 7, 7, 7),
        front: arms(cy + 10, r * 0.6, p, false, 6) + `<path d="${[-0.35, -0.12, 0.12, 0.35].map((k) => `M${f(C + r * k)} ${f(cy + r * 0.12)} v${f(r * 0.3)}`).join(" ")}" stroke="${p.edge}" stroke-width="1.5" stroke-linecap="round" opacity="0.8"/>`,
      };
    }

    // Skull — spooky, secretly sweet. Bone arms; stage 3 has horns,
    // crossbones and eye sockets lit in its own colour.
    case "skull": {
      const bone = (d: string) => limb(d, { fill: "#fff", edge: p.edge }, 4);
      if (stage === 2) return { back: legs(bottom - 4, p, 8, 8, 6), front: bone(`M${f(C - r + 2)} ${f(cy + 6)} q-8 4 -10 10`) + bone(`M${f(C + r - 2)} ${f(cy + 6)} q8 4 10 10`) };
      const cross = `<path d="M${f(C - r - 14)} ${f(cy + 20)} L${f(C + r + 14)} ${f(cy - 20)} M${f(C + r + 14)} ${f(cy + 20)} L${f(C - r - 14)} ${f(cy - 20)}" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.9"/>` + [[-1, 1], [1, -1], [1, 1], [-1, -1]].map(([sx, sy]) => `<circle cx="${f(C + sx * (r + 14))}" cy="${f(cy + sy * 20)}" r="3.5" fill="#fff"/>`).join("");
      return {
        back: cross + horns(cy, r, p, 12, 12) + legs(bottom - 4, p, 9, 10, 7) + claws(bottom + 5, 9),
        front: bone(`M${f(C - r + 2)} ${f(cy + 8)} q-10 -6 -12 -16`) + bone(`M${f(C + r - 2)} ${f(cy + 8)} q10 -6 12 -16`) + `<circle cx="${f(C - 9)}" cy="${f(cy - 9)}" r="7" fill="${p.fill}" opacity="0.35"/><circle cx="${f(C + 9)}" cy="${f(cy - 9)}" r="7" fill="${p.fill}" opacity="0.35"/>`,
      };
    }

    // Cactus — prickly, low maintenance. Cactus arms and a flower;
    // stage 3 is a whole saguaro with a bloom crown and a pot of roots.
    case "cactus": {
      const arm = (dir: 1 | -1, h: number, y: number) => solid(`M${f(C + dir * r * 0.6)} ${f(y + 6)} h${f(dir * 6)} V${f(y - h)} a4 4 0 0 1 ${f(dir * 8)} 0 V${f(y)} h${f(dir * 2)} V${f(y + 6)} Z`, p) + `<path d="M${f(C + dir * (r * 0.6 + 10))} ${f(y - h + 4)} V${f(y)}" stroke="${INK}" stroke-width="1" stroke-dasharray="1.5 3" opacity="0.5"/>`;
      const bloom = (x: number, y: number, s: number) => `${[0, 1, 2, 3, 4, 5].map((i) => { const a = (i * Math.PI) / 3; return `<ellipse cx="${f(x + s * Math.cos(a))}" cy="${f(y + s * Math.sin(a))}" rx="${f(s * 0.7)}" ry="${f(s * 0.45)}" fill="#ff7ab6" transform="rotate(${(i * 180) / 3} ${f(x + s * Math.cos(a))} ${f(y + s * Math.sin(a))})"/>`; }).join("")}<circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 0.5)}" fill="#fff59d"/>`;
      if (stage === 2) return { back: arm(-1, 10, cy) + arm(1, 6, cy + 6) + legs(bottom - 4, p, 7, 6, 6), front: bloom(C, top - 2, 3.5) };
      return {
        back: arm(-1, 18, cy - 2) + arm(1, 12, cy + 4) + `<path d="M${f(C - 18)} ${f(bottom - 4)} h36 v4 h-3 l-3 10 h-24 l-3 -10 h-3 Z" fill="#b5651d" stroke="#e0a060" stroke-width="1.5" stroke-linejoin="round"/>`,
        front: bloom(C, top - 4, 4.5) + bloom(C - r * 0.6 - 10, cy - 20, 3) + bloom(C + r * 0.6 + 10, cy - 8, 2.5),
      };
    }

    // Snowflake — cool, literally. Ice-crystal ears; stage 3 is wrapped
    // in an icy aura with frost spikes.
    case "flake": {
      const spike = (x: number, y: number, h: number, rot: number) => `<path d="M${f(x)} ${f(y)} l-3 ${f(h * 0.25)} l3 ${f(-h)} l3 ${f(h)} Z" fill="#fff" opacity="0.85" transform="rotate(${rot} ${f(x)} ${f(y)})"/>`;
      if (stage === 2) return { back: spike(C - 12, top + 8, 12, -30) + spike(C + 12, top + 8, 12, 30) + legs(bottom - 10, p, 8, 8), front: arms(cy, r, p, false, 5) };
      return {
        back: `<path d="${flakePath(r + 8, C, cy)}" fill="${p.edge}" opacity="0.25" transform="rotate(15 ${C} ${cy})"/>` + spike(C - 14, top + 10, 18, -35) + spike(C + 14, top + 10, 18, 35) + spike(C, top + 4, 14, 0) + spike(C - r - 10, cy + 6, 12, -100) + spike(C + r + 10, cy + 6, 12, 100) + sparkle(C - r - 14, cy - 18, 3, "#fff") + sparkle(C + r + 16, cy - 10, 2.5, "#fff") + legs(bottom - 12, p, 10, 10, 7),
        front: arms(cy, r, p, true, 6),
      };
    }

    // Octo — clever. Tentacle arms; stage 3 has four waving tentacles,
    // a coral crown and ink splashes.
    case "octo": {
      const tent = (dir: 1 | -1, len: number, lift: number) => limb(`M${f(C + dir * (r - 6))} ${f(cy + 10)} q${f(dir * len * 0.6)} ${f(-lift * 0.2)} ${f(dir * len)} ${f(-lift)} q${f(dir * 4)} -6 -2 -8`, p, 6);
      if (stage === 2) return { back: tent(-1, 14, 6) + tent(1, 14, 6), front: `<circle cx="${f(C + r * 0.5)}" cy="${f(cy - r * 0.6)}" r="2" fill="${p.edge}" opacity="0.6"/>` };
      const ink = (x: number, y: number, s: number) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" fill="${INK}" opacity="0.5"/>`;
      return {
        back: tent(-1, 20, 18) + tent(1, 20, 18) + tent(-1, 24, 2) + tent(1, 24, 2) + solid(`M${f(C - 10)} ${f(top + 4)} q-2 -10 2 -14 q4 6 4 10 M${f(C + 2)} ${f(top + 2)} q0 -12 6 -14 q2 8 -1 12 M${f(C - 3)} ${f(top + 2)} q-1 -8 2 -10 q3 4 2 9`, p) + ink(C - r - 14, bottom - 2, 4) + ink(C + r + 12, bottom + 2, 3) + ink(C + r + 20, bottom - 8, 2),
        front: `<circle cx="${f(C + r * 0.5)}" cy="${f(cy - r * 0.6)}" r="2.5" fill="${p.edge}" opacity="0.6"/><circle cx="${f(C - r * 0.6)}" cy="${f(cy - r * 0.4)}" r="1.8" fill="${p.edge}" opacity="0.6"/>`,
      };
    }

    // Flame — hot-headed, warm-hearted. Flame arms and flicker tips;
    // stage 3 burns with a crown of tongues, fire wings and embers.
    case "flame": {
      const ember = (x: number, y: number, sz: number) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(sz)}" fill="#fde68a" opacity="0.85"/>`;
      const tongues = solid(`M${f(C - 14)} ${f(top + 14)} q-6 -14 2 -22 q2 10 8 12 q0 -14 6 -22 q4 12 8 16 q2 -10 8 -14 q-2 14 -6 22 Z`, p);
      if (stage === 2) return { back: ember(C - r - 6, cy - 10, 2) + ember(C + r + 6, cy - 18, 1.5) + legs(bottom - 6, p, 8, 8), front: arms(cy, r, p, true, 6) };
      return {
        back: wings(cy + 2, r - 8, p, 20, 0.55) + tongues + ember(C - r - 10, cy - 14, 2.5) + ember(C + r + 10, cy - 24, 2) + ember(C + r + 16, cy - 4, 1.5) + ember(C - r - 16, cy + 4, 1.5) + legs(bottom - 8, p, 9, 10, 7) + claws(bottom + 3, 9),
        front: arms(cy, r, p, true, 7),
      };
    }

    // Pad — born to game. Thumbstick antennae; stage 3 has bumper
    // shoulders, trigger horns and a cable tail.
    case "pad": {
      const sticks = `<path d="M${f(C - 8)} ${f(top + 2)} v-9 M${f(C + 8)} ${f(top + 2)} v-9" stroke="${p.edge}" stroke-width="2.5" stroke-linecap="round"/><circle cx="${f(C - 8)}" cy="${f(top - 10)}" r="3.5" fill="${INK}" stroke="${p.edge}" stroke-width="1.5"/><circle cx="${f(C + 8)}" cy="${f(top - 10)}" r="3.5" fill="${INK}" stroke="${p.edge}" stroke-width="1.5"/>`;
      if (stage === 2) return { back: sticks + legs(bottom - 10, p, 10, 8), front: arms(cy - 2, r * 1.1, p, false, 6) };
      return {
        back: sticks + solid(`M${f(C - r * 1.1)} ${f(top + 6)} h-6 l2 -10 h8 Z M${f(C + r * 1.1)} ${f(top + 6)} h6 l-2 -10 h-8 Z`, p) + tail(cy, r, p, `M${f(C + r * 1.1)} ${f(cy + 4)} q18 4 18 -14 q0 -8 -6 -10`, 3) + `<circle cx="${f(C + r * 1.1 + 12)}" cy="${f(cy - 20)}" r="3" fill="${p.edge}"/>` + legs(bottom - 12, p, 12, 10, 7) + claws(bottom - 1, 12),
        front: arms(cy - 2, r * 1.1, p, true, 7) + sparkle(C - r * 0.2, top + 4, 3, "#fff"),
      };
    }

    // Rocket — impatient, always leaving. Hovers on its exhaust, no
    // legs; stage 3 has a nose light, three fins and an orbit of stars.
    case "rocket": {
      const puff = (x: number, y: number, sz: number) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(sz)}" fill="${p.edge}" opacity="0.5"/>`;
      if (stage === 2) return { back: puff(C - 12, bottom + 10, 4) + puff(C + 10, bottom + 12, 3) + puff(C - 2, bottom + 16, 2.5), front: arms(cy, r * 0.7, p, false, 5) };
      return {
        back: `<ellipse cx="${C}" cy="${f(cy + 6)}" rx="44" ry="14" fill="none" stroke="${p.edge}" stroke-width="1.2" stroke-dasharray="3 6" opacity="0.6"/>` + sparkle(C - 40, cy + 2, 3, "#fff") + sparkle(C + 42, cy + 10, 2.5, "#fff") + puff(C - 14, bottom + 12, 5) + puff(C + 12, bottom + 14, 4) + puff(C - 2, bottom + 20, 3) + puff(C + 4, bottom + 8, 3) + solid(`M${f(C - 3)} ${f(cy + r * 0.3)} L${f(C)} ${f(bottom + 12)} L${f(C + 3)} ${f(cy + r * 0.3)} Z`, p) + `<circle cx="${C}" cy="${f(top - 2)}" r="3" fill="#fde68a" stroke="#fff" stroke-width="1"/>`,
        front: arms(cy, r * 0.7, p, true, 6),
      };
    }

    // Penguin — formal. Flippers and a waddle; stage 3 is the Emperor:
    // a gold crest, a scarf, and ice sparkles.
    case "penguin": {
      const flipper = (dir: 1 | -1, up: boolean) => solid(`M${f(C + dir * (r * 0.85))} ${f(cy - r * 0.3)} Q${f(C + dir * (r * 1.5))} ${f(cy + (up ? -r * 0.6 : r * 0.2))} ${f(C + dir * (r * 1.2))} ${f(cy + (up ? -r * 0.1 : r * 0.7))} Q${f(C + dir * (r * 0.95))} ${f(cy + r * 0.6)} ${f(C + dir * (r * 0.85))} ${f(cy + r * 0.2)} Z`, p);
      const ice = (x: number, y: number, sz: number) => sparkle(x, y, sz, "#e0f2fe");
      if (stage === 2) return { back: ice(C - r - 10, cy - 12, 3) + ice(C + r + 8, cy - 20, 2.5), front: flipper(-1, false) + flipper(1, false) };
      return {
        back: ice(C - r - 12, cy - 16, 4) + ice(C + r + 10, cy - 24, 3) + ice(C + r + 16, cy, 2) + solid(`M${f(C - 10)} ${f(top + 4)} q2 -14 10 -16 q8 2 10 16 q-6 -6 -10 -2 q-4 -4 -10 2 Z`, { fill: "#fbbf24", edge: "#fde68a" }),
        front: flipper(-1, true) + flipper(1, true) + `<path d="M${f(C - r * 0.8)} ${f(cy + r * 0.62)} q${f(r * 0.8)} 7 ${f(r * 1.6)} 0" stroke="#ef4444" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M${f(C + r * 0.55)} ${f(cy + r * 0.66)} q7 8 3 18" stroke="#ef4444" stroke-width="4" fill="none" stroke-linecap="round"/>`,
      };
    }

    // Dino — stomps about. Back plates, a thick tail and stubby legs;
    // stage 3 has horns, bigger plates and a spiked tail club.
    case "dino": {
      const dtail = (len: number, w: number) => tail(cy, r, p, `M${f(C + r - 8)} ${f(cy + r * 0.5)} q${f(len)} 2 ${f(len + 4)} -12`, w);
      if (stage === 2) return { back: dtail(12, 8) + legs(bottom - 8, p, 10, 9, 8), front: arms(cy, r, p, false, 6) };
      return {
        back: horns(cy, r, p, 10, 14) + dtail(18, 10) + solid(`M${f(C + r + 14)} ${f(cy + r * 0.5 - 14)} l-2 -8 l6 4 l2 -8 l3 7 l7 -2 l-3 7 Z`, p) + legs(bottom - 10, p, 12, 11, 9) + claws(bottom + 2, 12),
        front: arms(cy, r, p, false, 7),
      };
    }

    // Fish — quiet, big thoughts. Fins and bubbles; stage 3 is a
    // whiskered river king with a dorsal crest and a wave.
    case "fish": {
      const bubble = (x: number, y: number, sz: number) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(sz)}" fill="none" stroke="${p.edge}" stroke-width="1.5" opacity="0.8"/>`;
      const fin = solid(`M${f(C - 4)} ${f(cy + r * 0.3)} q-10 10 -4 18 q6 -6 12 -14 Z`, p);
      if (stage === 2) return { back: bubble(C - r - 12, cy - 12, 3) + bubble(C - r - 6, cy - 22, 2) + solid(`M${f(C - 6)} ${f(top + 4)} q4 -14 14 -10 q-6 4 -6 12 Z`, p) + legs(bottom - 6, p, 9, 7, 6), front: fin };
      return {
        back: bubble(C - r - 14, cy - 14, 3.5) + bubble(C - r - 6, cy - 26, 2.5) + bubble(C + r + 10, cy - 20, 2) + solid(`M${f(C - 12)} ${f(top + 6)} q2 -16 10 -14 q4 -8 12 -6 q0 8 6 14 Z`, p) + `<path d="M${f(C - r - 2)} ${f(cy + 2)} q-10 -2 -16 6 M${f(C - r - 2)} ${f(cy + 6)} q-10 2 -14 10" stroke="${p.edge}" stroke-width="1.5" fill="none" stroke-linecap="round"/>` + `<path d="M${f(C - 44)} ${f(bottom + 8)} q8 -8 16 0 t16 0 t16 0 t16 0 t16 0" stroke="${p.edge}" stroke-width="2" fill="none" opacity="0.6"/>` + legs(bottom - 8, p, 10, 8, 7),
        front: fin + solid(`M${f(C + 2)} ${f(cy + r * 0.3)} q-8 10 -2 18 q6 -6 10 -14 Z`, p),
      };
    }

    // Bat — hangs around, upside down. Small wings; stage 3 has a huge
    // wingspan, fangs, and a moon behind.
    case "bat": {
      if (stage === 2) return { back: wings(cy, r - 6, p, 16) + legs(bottom - 6, p, 8, 7, 6), front: "" };
      return {
        back: `<circle cx="${f(C + 30)}" cy="${f(cy - 26)}" r="9" fill="${p.edge}" opacity="0.5"/>` + wings(cy, r - 4, p, 30) + tail(cy, r, p, `M${f(C + 4)} ${f(bottom - 4)} q10 8 8 18`, 3) + solid(`M${f(C + 12)} ${f(bottom + 14)} l-4 -4 h8 Z`, p) + legs(bottom - 8, p, 9, 9, 7) + claws(bottom + 2, 9),
        front: `<path d="M${f(C - 5)} ${f(cy + 10)} l1.5 4 l1.5 -4 M${f(C + 2)} ${f(cy + 10)} l1.5 4 l1.5 -4" fill="#fff" stroke="#fff" stroke-width="0.8" stroke-linejoin="round"/>`,
      };
    }

    // Bot — logical, mostly. Block limbs and an antenna; stage 3 has
    // shoulder cannons, a chest screen and jet feet.
    case "bot": {
      const block = (x: number, y: number, w: number, h: number) => `<rect x="${f(x - w / 2)}" y="${f(y - h / 2)}" width="${f(w)}" height="${f(h)}" rx="1.5" fill="${p.fill}" stroke="${p.edge}" stroke-width="2"/>`;
      if (stage === 2) return { back: block(C - 11, bottom + 4, 8, 10) + block(C + 11, bottom + 4, 8, 10), front: block(C - r - 4, cy + 4, 7, 14) + block(C + r + 4, cy + 4, 7, 14) };
      return {
        back: block(C - r - 4, cy - r + 6, 12, 10) + block(C + r + 4, cy - r + 6, 12, 10) + `<rect x="${f(C - r - 7)}" y="${f(cy - r - 10)}" width="6" height="10" rx="1" fill="${INK}" stroke="${p.edge}" stroke-width="1.5"/><rect x="${f(C + r + 1)}" y="${f(cy - r - 10)}" width="6" height="10" rx="1" fill="${INK}" stroke="${p.edge}" stroke-width="1.5"/>` + block(C - 12, bottom + 5, 10, 12) + block(C + 12, bottom + 5, 10, 12) + `<path d="M${f(C - 15)} ${f(bottom + 12)} q3 8 6 0 M${f(C + 9)} ${f(bottom + 12)} q3 8 6 0" fill="#fb923c"/>`,
        front: block(C - r - 6, cy + 6, 9, 18) + block(C + r + 6, cy + 6, 9, 18) + `<rect x="${f(C - 8)}" y="${f(cy + r * 0.35)}" width="16" height="9" rx="1" fill="${INK}" opacity="0.6"/><path d="M${f(C - 5)} ${f(cy + r * 0.35 + 6)} l3 -3 l2 2 l3 -4 l2 3" stroke="${p.edge}" stroke-width="1.2" fill="none"/>`,
      };
    }

    // Crown — royal, says so. Legs and a little cape; stage 3 has a
    // flowing cape, a sceptre and sparkle.
    case "crown": {
      const cape = (w: number, h: number) => `<path d="M${f(C - r * 0.9)} ${f(cy - r * 0.2)} q${f(-w * 0.3)} ${f(h * 0.6)} ${f(-w * 0.1)} ${f(h)} h${f(r * 1.8 + w * 0.2)} q${f(w * 0.2)} ${f(-h * 0.4)} ${f(-w * 0.1)} ${f(-h)} Z" fill="#b91c1c" stroke="#fca5a5" stroke-width="1.5" stroke-linejoin="round"/>`;
      if (stage === 2) return { back: cape(10, 26) + legs(bottom - 4, p, 10, 7, 6), front: arms(cy + 2, r * 1.0, p, false, 6) };
      return {
        back: cape(22, 40) + `<path d="M${f(C + r + 12)} ${f(cy + 16)} v-34" stroke="${p.edge}" stroke-width="3" stroke-linecap="round"/><path d="${polyPath(4, 5, 0, C + r + 12, cy - 22)}" fill="#3b82f6" stroke="#fff" stroke-width="1.2"/>` + sparkle(C - r - 10, cy - 20, 4, "#fff") + sparkle(C + 8, top - 12, 3, "#fff") + legs(bottom - 4, p, 11, 9, 7),
        front: arms(cy + 2, r * 1.0, p, false, 7),
      };
    }

    // Shield — steady, has your back. A sword and legs; stage 3 has a
    // plumed helmet, a banner and a bigger blade.
    case "shield": {
      const sword = (x: number, y: number, len: number, rot: number) => `<g transform="rotate(${rot} ${f(x)} ${f(y)})"><path d="M${f(x)} ${f(y)} v${f(-len)} l-3 4 M${f(x)} ${f(y - len)} l3 4" stroke="#e5e7eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M${f(x - 6)} ${f(y)} h12" stroke="#fcd34d" stroke-width="3" stroke-linecap="round"/><path d="M${f(x)} ${f(y)} v6" stroke="#92400e" stroke-width="3" stroke-linecap="round"/></g>`;
      if (stage === 2) return { back: sword(C + r + 8, cy + 6, 22, 15) + legs(bottom - 6, p, 9, 8, 6), front: arms(cy, r, p, false, 6) };
      return {
        back: `<path d="M${f(C - r - 18)} ${f(cy - 34)} h16 v40 l-8 -8 l-8 8 Z" fill="#b91c1c" stroke="#fca5a5" stroke-width="1.5" stroke-linejoin="round"/><path d="M${f(C - r - 20)} ${f(cy - 34)} h20" stroke="#fcd34d" stroke-width="3" stroke-linecap="round"/>` + sword(C + r + 10, cy + 8, 32, 20) + solid(`M${f(C - 10)} ${f(top + 2)} q10 -14 20 0 Z`, p) + `<path d="M${f(C)} ${f(top - 6)} q-14 -8 -22 2 q10 -2 16 6" fill="#ef4444" stroke="#fca5a5" stroke-width="1.5" stroke-linejoin="round"/>` + legs(bottom - 6, p, 10, 10, 7),
        front: arms(cy, r, p, false, 7),
      };
    }

    default:
      return { back: "", front: "" };
  }
}

/** Inner SVG markup for a pet (viewBox 0 0 100 100). */
export function petSvg({ shape, color, edge, stage, napping }: PetArtInput): string {
  const sh = SHAPES[shape ?? "pent"] ? (shape as string) : "pent";
  const p: Pal = { fill: color ?? "#ff7a2f", edge: edge ?? "#ffb27a" };

  const dx = EYE_DX[sh] ?? 0;
  const dy = EYE_DY[sh] ?? 0;

  if (stage === 1) {
    const r = 18;
    const cy = 58;
    const d1 = detail(sh, 1, p, r, cy);
    return (
      `<ellipse cx="${C}" cy="94" rx="${r + 2}" ry="4" fill="rgba(0,0,0,0.5)"/>` +
      solid(SHAPES[sh](r, C, cy), p) +
      d1 +
      `<g transform="translate(${dx} ${dy * 0.8})">${napping ? eyesNapping(cy - 2, 5) : eyesStage1(cy - 2, 5)}</g>`
    );
  }

  const r = stage === 2 ? 22 : 26;
  const cy = stage === 2 ? 54 : 50;
  const eyeY = stage === 2 ? cy - 3 : cy - 5;
  const eyeOff = stage === 2 ? 7 : 9;
  const layers = creature(sh, stage, p);
  const glow =
    stage === 3
      ? `<circle cx="${C}" cy="${cy + 4}" r="46" fill="none" stroke="${p.fill}" stroke-width="1.5" stroke-dasharray="3 7" opacity="0.45"/>`
      : "";
  const blush = `<circle cx="${f(C - eyeOff - 7)}" cy="${f(eyeY + 6)}" r="2.4" fill="#ff8fa3" opacity="0.6"/><circle cx="${f(C + eyeOff + 7)}" cy="${f(eyeY + 6)}" r="2.4" fill="#ff8fa3" opacity="0.6"/>`;
  const face0 = blush + (napping ? eyesNapping(eyeY, eyeOff) : stage === 2 ? eyesStage2(eyeY, eyeOff, p.edge) : eyesStage3(eyeY, eyeOff, p.edge, p.fill));
  const face = dx || dy ? `<g transform="translate(${dx} ${dy})">${face0}</g>` : face0;
  const bodyD = SHAPES[sh](r, C, cy);

  return (
    glow +
    `<ellipse cx="${C}" cy="95" rx="${r + 8}" ry="4" fill="rgba(0,0,0,0.5)"/>` +
    layers.back +
    dark(bodyD, 0.22, 'transform="translate(2 3)"') +
    solid(bodyD, p) +
    `<path d="${SHAPES[sh](r * 0.8, C, cy)}" fill="#fff" opacity="0.14" transform="translate(-2 -3)"/>` +
    (BELLY.has(sh) ? `<ellipse cx="${C}" cy="${f(cy + r * 0.45)}" rx="${f(r * 0.42)}" ry="${f(r * 0.3)}" fill="#fff" opacity="0.22"/>` : "") +
    detail(sh, stage, p, r, cy) +
    layers.front +
    face
  );
}

/** The egg. */
export function eggSvg(): string {
  return (
    `<ellipse cx="50" cy="94" rx="26" ry="4" fill="rgba(0,0,0,0.5)"/>` +
    `<path d="M50 8 C76 8 86 44 86 66 C86 86 70 92 50 92 C30 92 14 86 14 66 C14 44 24 8 50 8 Z" fill="#23262c" stroke="#3a3f48" stroke-width="2"/>` +
    `<polygon points="50,34 60,41 56,53 44,53 40,41" fill="none" stroke="#ff7a2f" stroke-width="2" stroke-linejoin="round" opacity="0.9"/>` +
    `<polygon points="32,66 38,70 36,77 28,77 26,70" fill="none" stroke="#ff7a2f" stroke-width="1.5" stroke-linejoin="round" opacity="0.5"/>` +
    `<polygon points="68,62 74,66 72,73 64,73 62,66" fill="none" stroke="#ff7a2f" stroke-width="1.5" stroke-linejoin="round" opacity="0.5"/>`
  );
}
