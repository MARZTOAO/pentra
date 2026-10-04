/**
 * Stack Trace — Pentra's tile-matching solitaire (supabase/95).
 *
 * MARZ (2026-10-04): "basically mahjong but call it something
 * original … make the tiles fit the app … 10 levels to start and
 * track player progress … a more relaxed game. No need for a
 * leaderboard. I just want users to see the levels they've beat and
 * the time each one took."
 *
 * Tiles are stacked in layers. A tile is free when nothing sits on
 * it and at least one of its long sides is open. Pick two free tiles
 * with the same face and they go; clear the stack to finish the
 * level. The clock runs from the first look at the board; a hint
 * adds ten seconds to it and a shuffle thirty, so a time means
 * something without anyone being punished for playing relaxed.
 *
 * Every board is dealt solvable: the faces are assigned by playing
 * the level backwards, removing free pairs from a full layout, so
 * the removal order exists before the player sees it. A shuffle
 * re-deals the tiles still on the board the same way.
 *
 * The 36 faces are Pentra's own — numbers, dice pips, arrows, shapes
 * and a few badges — in the app's five colours, drawn in code so
 * they're crisp at any size.
 */

export type TraceCallbacks = {
  /** Elapsed clock (including penalties), every ~250ms while running. */
  onTick: (elapsedMs: number) => void;
  /** Tiles left and matching free pairs available, after every change. */
  onBoard: (tilesLeft: number, movesLeft: number) => void;
  /** The level is clear. */
  onWin: (elapsedMs: number) => void;
};

export type TraceHandle = {
  click(x: number, y: number): void;
  hint(): void;
  shuffle(): void;
  pause(): void;
  resume(): void;
  destroy(): void;
};

export const LEVEL_COUNT = 10;
export const HINT_PENALTY_MS = 10_000;
export const SHUFFLE_PENALTY_MS = 30_000;

type Pos = { x: number; y: number; z: number };
type Tile = Pos & { id: number; face: number };

/* ---- layouts ------------------------------------------------------ */

// Positions are in half-tile units: a tile is 2 wide and 2 tall, so
// two tiles side by side are at x and x+2, and a tile centred over a
// pair sits at x+1. z is the layer.
function rect(x0: number, y0: number, cols: number, rows: number, z: number): Pos[] {
  const out: Pos[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) out.push({ x: x0 + i * 2, y: y0 + j * 2, z });
  return out;
}
function row(x0: number, y: number, cols: number, z: number): Pos[] {
  return rect(x0, y, cols, 1, z);
}

/** The classic 144-tile turtle, in these units. */
function turtle(): Pos[] {
  return [
    ...row(2, 0, 12, 0),
    ...row(6, 2, 8, 0),
    ...row(4, 4, 10, 0),
    ...row(2, 6, 12, 0),
    ...row(2, 8, 12, 0),
    ...row(4, 10, 10, 0),
    ...row(6, 12, 8, 0),
    ...row(2, 14, 12, 0),
    { x: 0, y: 7, z: 0 },
    { x: 26, y: 7, z: 0 },
    { x: 28, y: 7, z: 0 },
    ...rect(8, 2, 6, 6, 1),
    ...rect(10, 4, 4, 4, 2),
    ...rect(12, 6, 2, 2, 3),
    { x: 13, y: 7, z: 4 },
  ];
}

export const LAYOUTS: { name: string; tiles: () => Pos[] }[] = [
  // In order of size, which is roughly order of difficulty.
  { name: "Warm-up", tiles: () => rect(0, 0, 6, 4, 0) }, // 24
  { name: "Step", tiles: () => [...rect(0, 0, 8, 4, 0), ...rect(2, 2, 6, 2, 1)] }, // 44
  { name: "Mesa", tiles: () => [...rect(0, 0, 8, 5, 0), ...rect(2, 2, 6, 3, 1), ...rect(6, 4, 2, 1, 2)] }, // 60
  { name: "Plateau", tiles: () => [...rect(0, 0, 10, 5, 0), ...rect(2, 2, 8, 3, 1), ...rect(6, 4, 4, 1, 2)] }, // 78
  {
    name: "Bridge",
    tiles: () => [
      ...rect(0, 0, 5, 6, 0),
      ...rect(14, 0, 5, 6, 0),
      ...row(10, 4, 2, 0),
      ...row(10, 6, 2, 0),
      ...rect(2, 2, 3, 4, 1),
      ...rect(14, 2, 3, 4, 1),
      ...row(10, 5, 2, 1),
    ], // 90
  },
  {
    name: "Pyramid",
    tiles: () => [...rect(0, 0, 10, 6, 0), ...rect(2, 2, 8, 4, 1), ...rect(4, 4, 6, 2, 2), ...rect(8, 5, 2, 1, 3)], // 106
  },
  { name: "Field", tiles: () => [...rect(0, 0, 14, 8, 0), ...rect(10, 6, 4, 2, 1)] }, // 120
  { name: "The Turtle", tiles: turtle }, // 144
  {
    name: "Terraces",
    tiles: () => [...rect(0, 0, 12, 6, 0), ...rect(2, 1, 10, 5, 1), ...rect(4, 2, 8, 4, 2), ...rect(6, 3, 6, 3, 3)], // 172, trimmed to 154
  },
  {
    name: "The Crossing",
    tiles: () => [
      ...rect(8, 0, 6, 10, 0),
      ...rect(0, 6, 22, 4, 0),
      ...rect(9, 2, 4, 6, 1),
      ...rect(4, 7, 14, 2, 1),
      ...rect(10, 4, 2, 2, 2),
      ...rect(10, 7, 2, 1, 3),
    ], // 182
  },
];

/** A level's positions, made even and deduplicated. */
export function layoutFor(level: number): Pos[] {
  const idx = Math.max(0, Math.min(LAYOUTS.length - 1, level - 1));
  const seen = new Set<string>();
  const out: Pos[] = [];
  for (const p of LAYOUTS[idx].tiles()) {
    const k = `${p.x},${p.y},${p.z}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  // Terraces is a 172-tile stack trimmed by dropping the back row of
  // the base and the top layer's corners, which keeps the shape.
  if (LAYOUTS[idx].name === "Terraces") {
    const trimmed = out.filter((p) => !(p.z === 0 && p.y === 10) && !(p.z === 3 && (p.x === 6 || p.x === 16)));
    return evenOut(trimmed);
  }
  return evenOut(out);
}
function evenOut(ps: Pos[]): Pos[] {
  if (ps.length % 2 === 0) return ps;
  // Drop the highest, right-most tile.
  const sorted = [...ps].sort((a, b) => b.z - a.z || b.y - a.y || b.x - a.x);
  return ps.filter((p) => p !== sorted[0]);
}

/* ---- free-tile rule ----------------------------------------------- */

function overlapsXY(a: Pos, b: Pos) {
  return Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
}
function isFree(t: Pos, others: Iterable<Pos>): boolean {
  let left = false;
  let right = false;
  for (const o of others) {
    if (o === t) continue;
    if (o.z === t.z + 1 && overlapsXY(t, o)) return false;
    if (o.z === t.z && Math.abs(o.y - t.y) < 2) {
      if (o.x < t.x && o.x + 2 > t.x - 2) left = true;
      else if (o.x > t.x && o.x - 2 < t.x + 2) right = true;
      if (left && right) return false;
    }
  }
  return true;
}

/* ---- dealing a solvable board ------------------------------------- */

const FACE_COUNT = 36;

function deal(positions: Pos[], rnd: () => number): Map<Pos, number> | null {
  const pairs = positions.length / 2;
  const faces: number[] = [];
  for (let i = 0; i < pairs; i++) faces.push(i % FACE_COUNT);
  for (let i = faces.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [faces[i], faces[j]] = [faces[j], faces[i]];
  }
  const remaining = new Set<Pos>(positions);
  const result = new Map<Pos, number>();
  while (remaining.size > 0) {
    const free = [...remaining].filter((p) => isFree(p, remaining));
    if (free.length < 2) return null;
    const a = free.splice(Math.floor(rnd() * free.length), 1)[0];
    const b = free.splice(Math.floor(rnd() * free.length), 1)[0];
    const f = faces.pop()!;
    result.set(a, f);
    result.set(b, f);
    remaining.delete(a);
    remaining.delete(b);
  }
  return result;
}

/* ---- faces -------------------------------------------------------- */

const COL = {
  orange: "#ff7a2f",
  white: "#e9ebee",
  purple: "#a66cff",
  teal: "#2ad4c8",
  slime: "#8bff3a",
};

type FaceDrawer = (c: CanvasRenderingContext2D, s: number) => void;

function poly(c: CanvasRenderingContext2D, pts: [number, number][]) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}
function regular(c: CanvasRenderingContext2D, n: number, r: number, rot = -Math.PI / 2) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  poly(c, pts);
}
function arrow(c: CanvasRenderingContext2D, s: number, angle: number) {
  c.save();
  c.rotate(angle);
  c.lineWidth = s * 0.16;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  c.moveTo(0, s * 0.42);
  c.lineTo(0, -s * 0.4);
  c.moveTo(-s * 0.3, -s * 0.1);
  c.lineTo(0, -s * 0.42);
  c.lineTo(s * 0.3, -s * 0.1);
  c.stroke();
  c.restore();
}
function pips(c: CanvasRenderingContext2D, s: number, n: number) {
  const d = s * 0.3;
  const r = s * 0.11;
  const spots: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [[-d, -d], [d, d]],
    3: [[-d, -d], [0, 0], [d, d]],
    4: [[-d, -d], [d, -d], [-d, d], [d, d]],
    5: [[-d, -d], [d, -d], [0, 0], [-d, d], [d, d]],
    6: [[-d, -d], [d, -d], [-d, 0], [d, 0], [-d, d], [d, d]],
  };
  for (const [x, y] of spots[n]) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
}

// 36 faces: 9 numbers, 6 pips, 8 arrows, 8 shapes, 5 badges.
const FACES: { color: string; draw: FaceDrawer }[] = [];
for (let n = 1; n <= 9; n++) {
  FACES.push({
    color: COL.orange,
    draw: (c, s) => {
      c.font = `700 ${s * 0.78}px "Space Mono", ui-monospace, monospace`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(String(n), 0, s * 0.04);
    },
  });
}
for (let n = 1; n <= 6; n++) FACES.push({ color: COL.white, draw: (c, s) => pips(c, s, n) });
for (let i = 0; i < 8; i++) FACES.push({ color: COL.teal, draw: (c, s) => arrow(c, s, (i * Math.PI) / 4) });
FACES.push(
  { color: COL.purple, draw: (c, s) => { c.beginPath(); c.arc(0, 0, s * 0.36, 0, Math.PI * 2); c.fill(); } },
  { color: COL.purple, draw: (c, s) => regular(c, 3, s * 0.42) },
  { color: COL.purple, draw: (c, s) => c.fillRect(-s * 0.32, -s * 0.32, s * 0.64, s * 0.64) },
  { color: COL.purple, draw: (c, s) => { c.fillRect(-s * 0.1, -s * 0.4, s * 0.2, s * 0.8); c.fillRect(-s * 0.4, -s * 0.1, s * 0.8, s * 0.2); } },
  { color: COL.purple, draw: (c, s) => regular(c, 5, s * 0.4) },
  { color: COL.purple, draw: (c, s) => regular(c, 6, s * 0.4, 0) },
  {
    color: COL.purple,
    draw: (c, s) => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? s * 0.18 : s * 0.42;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      poly(c, pts);
    },
  },
  { color: COL.purple, draw: (c, s) => poly(c, [[0, -s * 0.42], [s * 0.3, 0], [0, s * 0.42], [-s * 0.3, 0]]) },
);
FACES.push(
  {
    // heart
    color: COL.slime,
    draw: (c, s) => {
      c.beginPath();
      c.moveTo(0, s * 0.38);
      c.bezierCurveTo(-s * 0.55, s * 0.02, -s * 0.3, -s * 0.42, 0, -s * 0.16);
      c.bezierCurveTo(s * 0.3, -s * 0.42, s * 0.55, s * 0.02, 0, s * 0.38);
      c.fill();
    },
  },
  { color: COL.slime, draw: (c, s) => poly(c, [[s * 0.08, -s * 0.44], [-s * 0.3, s * 0.04], [-s * 0.02, s * 0.04], [-s * 0.1, s * 0.44], [s * 0.3, -s * 0.06], [s * 0.02, -s * 0.06]]) }, // bolt
  {
    // shield
    color: COL.slime,
    draw: (c, s) => {
      c.beginPath();
      c.moveTo(0, -s * 0.42);
      c.lineTo(s * 0.34, -s * 0.28);
      c.quadraticCurveTo(s * 0.34, s * 0.2, 0, s * 0.42);
      c.quadraticCurveTo(-s * 0.34, s * 0.2, -s * 0.34, -s * 0.28);
      c.closePath();
      c.fill();
    },
  },
  { color: COL.slime, draw: (c, s) => poly(c, [[-s * 0.26, -s * 0.3], [s * 0.26, -s * 0.3], [s * 0.42, -s * 0.08], [0, s * 0.42], [-s * 0.42, -s * 0.08]]) }, // gem
  {
    // key
    color: COL.slime,
    draw: (c, s) => {
      c.beginPath();
      c.arc(-s * 0.18, -s * 0.16, s * 0.2, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#1f2227";
      c.beginPath();
      c.arc(-s * 0.18, -s * 0.16, s * 0.08, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = COL.slime;
      c.save();
      c.rotate(Math.PI / 4);
      c.fillRect(0, -s * 0.07, s * 0.5, s * 0.14);
      c.fillRect(s * 0.3, -s * 0.07, s * 0.08, s * 0.26);
      c.fillRect(s * 0.44, -s * 0.07, s * 0.08, s * 0.22);
      c.restore();
    },
  },
);

/* ---- the game ----------------------------------------------------- */

const SIDE_RATIO = 0.22; // 3D edge per layer, as a share of half a tile
const PAD = 12;

export function mountStackTrace(
  canvas: HTMLCanvasElement,
  level: number,
  callbacks: TraceCallbacks,
): TraceHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  let seed = Math.floor(Math.random() * 1e9) || 1;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const positions = layoutFor(level);
  let tiles: Tile[] = [];
  let selected: Tile | null = null;
  let hinted: Tile[] = [];
  let hintUntil = 0;
  let shake: { tile: Tile; until: number } | null = null;
  let vanishing: { tile: Tile; t: number }[] = [];

  // The clock: accumulated while running, plus penalties.
  let elapsed = 0;
  let penalty = 0;
  let runningSince: number | null = null;
  let finished = false;
  let destroyed = false;
  let raf = 0;
  let tickTimer = 0;

  // Geometry, from the canvas width.
  let width = 600;
  let dpr = 1;
  let hw = 18; // half a tile's width in px
  let hh = 24; // half a tile's height
  let side = 4; // px of 3D edge per layer
  let ox = 0;
  let oy = 0;
  let height = 400;
  const minX = Math.min(...positions.map((p) => p.x));
  const maxX = Math.max(...positions.map((p) => p.x)) + 2;
  const minY = Math.min(...positions.map((p) => p.y));
  const maxY = Math.max(...positions.map((p) => p.y)) + 2;
  const maxZ = Math.max(...positions.map((p) => p.z));

  function deal_() {
    let d: Map<Pos, number> | null = null;
    for (let tries = 0; tries < 50 && !d; tries++) d = deal(positions, rnd);
    if (!d) {
      // Should not happen with these layouts; fall back to a plain
      // pairing so the level still loads (it may not be solvable).
      d = new Map();
      positions.forEach((p, i) => d!.set(p, Math.floor(i / 2) % FACE_COUNT));
    }
    tiles = positions.map((p, i) => ({ ...p, id: i, face: d!.get(p)! }));
  }

  // Tiles are sized to fit the container, but never smaller than a
  // finger can hit: a big level on a phone becomes wider than the
  // screen and the page lets it scroll sideways.
  function resize() {
    const host = canvas.parentElement ?? canvas;
    const available = Math.max(300, Math.round(host.getBoundingClientRect().width));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    hw = Math.floor((available - PAD * 2) / (spanX + maxZ * SIDE_RATIO));
    hw = Math.max(13, Math.min(26, hw));
    hh = Math.round(hw * 1.32);
    side = Math.max(2, Math.round(hw * SIDE_RATIO));
    width = Math.max(available, spanX * hw + maxZ * side + PAD * 2);
    height = spanY * hh + maxZ * side + PAD * 2;
    ox = Math.round((width - (spanX * hw + maxZ * side)) / 2) + maxZ * side;
    oy = PAD + maxZ * side;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function screen(t: Pos) {
    return { x: ox + (t.x - minX) * hw - t.z * side, y: oy + (t.y - minY) * hh - t.z * side };
  }

  const free = (t: Tile) => isFree(t, tiles);

  function movesLeft(): number {
    const frees = tiles.filter(free);
    const byFace = new Map<number, number>();
    for (const t of frees) byFace.set(t.face, (byFace.get(t.face) ?? 0) + 1);
    let n = 0;
    for (const count of byFace.values()) n += Math.floor(count / 2);
    return n;
  }

  function report() {
    callbacks.onBoard(tiles.length, movesLeft());
  }

  function clock() {
    return elapsed + penalty + (runningSince !== null ? performance.now() - runningSince : 0);
  }

  function start() {
    if (runningSince === null && !finished) runningSince = performance.now();
  }
  function pause() {
    if (runningSince !== null) {
      elapsed += performance.now() - runningSince;
      runningSince = null;
    }
  }
  function resume() {
    if (!finished && runningSince === null) runningSince = performance.now();
  }

  function remove(a: Tile, b: Tile) {
    tiles = tiles.filter((t) => t !== a && t !== b);
    vanishing.push({ tile: a, t: 0 }, { tile: b, t: 0 });
    selected = null;
    hinted = [];
    loop();
    report();
    if (tiles.length === 0) {
      finished = true;
      pause();
      callbacks.onWin(Math.round(clock()));
    }
  }

  function click(x: number, y: number) {
    if (finished) return;
    start();
    // Top-most tile under the point wins.
    const order = [...tiles].sort((a, b) => b.z - a.z || b.y - a.y || b.x - a.x);
    let hit: Tile | null = null;
    for (const t of order) {
      const s = screen(t);
      if (x >= s.x && x <= s.x + hw * 2 && y >= s.y && y <= s.y + hh * 2) {
        hit = t;
        break;
      }
    }
    if (!hit) {
      selected = null;
      draw();
      return;
    }
    if (!free(hit)) {
      shake = { tile: hit, until: performance.now() + 350 };
      loop();
      return;
    }
    if (selected === hit) {
      selected = null;
    } else if (selected && selected.face === hit.face) {
      remove(selected, hit);
      return;
    } else {
      selected = hit;
    }
    draw();
  }

  function hint() {
    if (finished) return;
    start();
    const frees = tiles.filter(free);
    const byFace = new Map<number, Tile[]>();
    for (const t of frees) byFace.set(t.face, [...(byFace.get(t.face) ?? []), t]);
    const pairs = [...byFace.values()].filter((l) => l.length >= 2);
    if (pairs.length === 0) return;
    const pick = pairs[Math.floor(rnd() * pairs.length)];
    hinted = [pick[0], pick[1]];
    hintUntil = performance.now() + 1800;
    penalty += HINT_PENALTY_MS;
    selected = null;
    loop();
  }

  function shuffle() {
    if (finished || tiles.length < 4) return;
    start();
    const remainingPositions = tiles.map((t) => ({ x: t.x, y: t.y, z: t.z }));
    let d: Map<Pos, number> | null = null;
    for (let tries = 0; tries < 50 && !d; tries++) d = deal(remainingPositions, rnd);
    if (!d) return;
    tiles = remainingPositions.map((p, i) => ({ ...p, id: i, face: d!.get(p)! }));
    penalty += SHUFFLE_PENALTY_MS;
    selected = null;
    hinted = [];
    report();
    draw();
  }

  /* ---- drawing ---------------------------------------------------- */

  function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  function drawTile(t: Tile, opts: { free: boolean; selected: boolean; hinted: boolean; dx: number; alpha: number; scale: number }) {
    const c = ctx!;
    const s = screen(t);
    const w = hw * 2;
    const h = hh * 2;
    const cx = s.x + w / 2 + opts.dx;
    const cy = s.y + h / 2;
    c.save();
    c.globalAlpha = opts.alpha;
    c.translate(cx, cy);
    c.scale(opts.scale, opts.scale);
    c.translate(-w / 2, -h / 2);

    // Side faces (down and right), then the top.
    c.fillStyle = "#0e0f11";
    roundRect(c, side, side, w, h, 4);
    c.fill();
    c.fillStyle = "#15171b";
    roundRect(c, side / 2, side / 2, w, h, 4);
    c.fill();

    c.fillStyle = opts.free ? "#23262c" : "#1b1e23";
    roundRect(c, 0, 0, w, h, 4);
    c.fill();
    c.lineWidth = opts.selected || opts.hinted ? 2 : 1;
    c.strokeStyle = opts.selected
      ? "#ff7a2f"
      : opts.hinted
        ? "#8bff3a"
        : opts.free
          ? "rgba(233,235,238,0.22)"
          : "rgba(233,235,238,0.08)";
    c.stroke();
    if (opts.selected) {
      c.fillStyle = "rgba(255,122,47,0.14)";
      c.fill();
    }

    // The face, in the family colour; blocked tiles are dimmer.
    const face = FACES[t.face];
    c.translate(w / 2, h / 2);
    c.globalAlpha = opts.alpha * (opts.free ? 1 : 0.5);
    c.fillStyle = face.color;
    c.strokeStyle = face.color;
    face.draw(c, Math.min(w, h) * 0.9);
    c.restore();
  }

  function draw() {
    const c = ctx!;
    c.clearRect(0, 0, width, height);
    const now = performance.now();
    const order = [...tiles].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
    for (const t of order) {
      const dx = shake && shake.tile === t ? Math.sin((shake.until - now) / 25) * 3 : 0;
      drawTile(t, {
        free: free(t),
        selected: selected === t,
        hinted: hinted.includes(t) && now < hintUntil,
        dx,
        alpha: 1,
        scale: 1,
      });
    }
    for (const v of vanishing) {
      const k = v.t / 0.22;
      drawTile(v.tile, { free: true, selected: false, hinted: false, dx: 0, alpha: 1 - k, scale: 1 + k * 0.25 });
    }
  }

  let last = 0;
  function frame(now: number) {
    if (destroyed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const v of vanishing) v.t += dt;
    vanishing = vanishing.filter((v) => v.t < 0.22);
    if (shake && now > shake.until) shake = null;
    if (hinted.length && now > hintUntil) hinted = [];
    draw();
    if (vanishing.length || shake || hinted.length) raf = requestAnimationFrame(frame);
  }
  function loop() {
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function onVisibility() {
    if (document.visibilityState === "visible") resume();
    else pause();
  }
  document.addEventListener("visibilitychange", onVisibility);

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(canvas.parentElement ?? canvas);

  deal_();
  resize();
  report();
  tickTimer = window.setInterval(() => {
    if (!finished) callbacks.onTick(Math.round(clock()));
  }, 250);

  return {
    click,
    hint,
    shuffle,
    pause,
    resume,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      window.clearInterval(tickTimer);
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

/** m:ss, or h:mm:ss past an hour. */
export function formatTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}
