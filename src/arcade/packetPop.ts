import type { ArcadeHandle, GameCallbacks, GameState, PointerKind } from "./types";

/**
 * Packet Pop — Pentra's bubble shooter (supabase/94).
 *
 * MARZ (2026-10-04): "an infinite bubble blaster game (match colors
 * to break chains and earn score). Have the colors of the bubbles
 * feature Pentra orange, white, purple, teal, slime green."
 *
 * Bubbles hang from the top in a hex grid. You aim from the bottom
 * and fire one; it bounces off the walls and sticks where it lands.
 * Three or more of a colour touching pop, and anything left hanging
 * with no path back to the top falls. Every few shots a new row is
 * pushed in from above, and the gap between pushes shrinks as the
 * score climbs (six shots a row down to four), so the game never
 * ends until the bubbles reach the line above the shooter.
 *
 * Scoring: 10 a bubble popped, 20 a bubble dropped (drops are the
 * skilled play), and 100 for clearing the board, which also brings
 * three fresh rows straight away. submit_arcade_score caps Packet
 * Pop at 400 points a second; a huge drop in a single shot is a few
 * hundred points, so that is well clear of honest play.
 *
 * Controls: move the pointer to aim and click (or press Space) to
 * fire; on a phone, drag to aim and let go to fire. ← → rotate the
 * aim on a keyboard.
 */

const COLORS = [
  "#ff7a2f", // Pentra orange
  "#e9ebee", // white
  "#a66cff", // purple
  "#2ad4c8", // teal
  "#8bff3a", // slime green
];

// Tall on purpose (MARZ, 2026-10-04: "about twice as tall"): the
// board is as tall as the window allows, between these two, so there
// is room for rows to come down before the line.
const HEIGHT_MIN = 600;
const HEIGHT_MAX = 960;
const COLS = 11;
const START_ROWS = 5;
const SHOT_SPEED = 1000; // px/s
const SHOOTER_ZONE = 86; // px at the bottom for the shooter and HUD
const RESTART_LOCK_MS = 450;
const MIN_SIN = 0.17; // never fire flatter than ~10° above horizontal

type Cell = { row: number; col: number };
type Pop = { x: number; y: number; color: string; t: number };
type Fall = { x: number; y: number; vy: number; vx: number; color: string };

export function mountPacketPop(canvas: HTMLCanvasElement, callbacks: GameCallbacks): ArcadeHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  let width = 360;
  let height = HEIGHT_MAX;
  let dpr = 1;
  let r = 16; // bubble radius, from the width
  let rowH = r * Math.sqrt(3);
  let state: GameState = "ready";
  let raf = 0;
  let last = 0;
  let destroyed = false;
  let seed = Math.floor(Math.random() * 1e9);

  // The run.
  let grid = new Map<string, string>(); // "row,col" -> colour
  let parity = 0; // row i is shifted right by r when (i + parity) is odd
  let score = 0;
  let shownScore = -1;
  let startedAt = 0;
  let diedAt = 0;
  let pushes = 0;
  let shotsUntilPush = 6;
  let current = COLORS[0];
  let next = COLORS[1];
  let angle = Math.PI / 2; // radians, from +x, upward
  let rotate = 0; // -1, 0, 1 from the arrow keys
  let aiming = false;
  let shot: { x: number; y: number; dx: number; dy: number; color: string } | null = null;
  let pops: Pop[] = [];
  let falls: Fall[] = [];
  let flash = 0;
  let banner: { text: string; t: number } | null = null;

  function rnd() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const shooterX = () => width / 2;
  const shooterY = () => height - 42;
  const deadline = () => height - SHOOTER_ZONE;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(300, Math.round(rect.width));
    // Fill the window's height, less room for the title above and
    // the controls line below, within the limits.
    height = Math.round(Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, (window.innerHeight || HEIGHT_MAX) - 200)));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = `${height}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    r = width / (COLS * 2);
    rowH = r * Math.sqrt(3);
    if (state !== "running") draw();
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);
  window.addEventListener("resize", resize);
  resize();

  /* ---- grid geometry ---------------------------------------------- */

  const key = (row: number, col: number) => `${row},${col}`;
  const shifted = (row: number) => (row + parity) % 2 === 1;
  const colsIn = (row: number) => (shifted(row) ? COLS - 1 : COLS);
  function center(row: number, col: number) {
    return { x: r + col * 2 * r + (shifted(row) ? r : 0), y: r + row * rowH };
  }
  function neighbours(row: number, col: number): Cell[] {
    const s = shifted(row);
    const out: Cell[] = [
      { row, col: col - 1 },
      { row, col: col + 1 },
      { row: row - 1, col: s ? col : col - 1 },
      { row: row - 1, col: s ? col + 1 : col },
      { row: row + 1, col: s ? col : col - 1 },
      { row: row + 1, col: s ? col + 1 : col },
    ];
    return out.filter((c) => c.row >= 0 && c.col >= 0 && c.col < colsIn(c.row));
  }
  function lowestY() {
    let y = -Infinity;
    for (const k of grid.keys()) {
      const row = Number(k.split(",")[0]);
      y = Math.max(y, center(row, 0).y);
    }
    return y;
  }

  /* ---- the run ----------------------------------------------------- */

  function randomColor(fromGrid: boolean) {
    if (fromGrid) {
      const present = new Set(grid.values());
      if (present.size > 0) {
        const list = [...present];
        return list[Math.floor(rnd() * list.length)];
      }
    }
    return COLORS[Math.floor(rnd() * COLORS.length)];
  }

  function addRowOnTop() {
    const moved = new Map<string, string>();
    for (const [k, v] of grid) {
      const [row, col] = k.split(",").map(Number);
      moved.set(key(row + 1, col), v);
    }
    grid = moved;
    parity = 1 - parity;
    for (let col = 0; col < colsIn(0); col++) grid.set(key(0, col), randomColor(false));
  }

  function reset() {
    grid = new Map();
    parity = 0;
    score = 0;
    shownScore = -1;
    pushes = 0;
    shotsUntilPush = 6;
    shot = null;
    pops = [];
    falls = [];
    flash = 0;
    banner = null;
    angle = Math.PI / 2;
    for (let i = 0; i < START_ROWS; i++) addRowOnTop();
    current = randomColor(true);
    next = randomColor(true);
  }

  function begin() {
    reset();
    state = "running";
    startedAt = performance.now();
    last = startedAt;
    callbacks.onState(state);
    callbacks.onScore(0);
    loop();
  }

  function die() {
    state = "over";
    diedAt = performance.now();
    flash = 0.3;
    shot = null;
    callbacks.onState(state);
    callbacks.onRunEnd({ score, durationMs: Math.round(diedAt - startedAt) });
  }

  function addScore(n: number) {
    score += n;
    if (score !== shownScore) {
      shownScore = score;
      callbacks.onScore(score);
    }
  }

  function fire() {
    if (state !== "running" || shot) return;
    shot = {
      x: shooterX(),
      y: shooterY(),
      dx: Math.cos(angle) * SHOT_SPEED,
      dy: -Math.sin(angle) * SHOT_SPEED,
      color: current,
    };
    current = next;
    next = randomColor(true);
  }

  function press() {
    if (state === "ready") {
      begin();
      return;
    }
    if (state === "over") {
      if (performance.now() - diedAt > RESTART_LOCK_MS) begin();
      return;
    }
    fire();
  }

  function release() {
    /* nothing to hold */
  }

  function aimAt(x: number, y: number) {
    const a = Math.atan2(shooterY() - y, x - shooterX());
    setAngle(a);
  }
  function setAngle(a: number) {
    const lo = Math.asin(MIN_SIN);
    angle = Math.max(lo, Math.min(Math.PI - lo, a));
  }

  function pointer(kind: PointerKind, x: number, y: number) {
    if (state !== "running") {
      if (kind === "down") press();
      return;
    }
    if (kind === "down") {
      aiming = true;
      aimAt(x, y);
    } else if (kind === "move") {
      // Aim follows the pointer whether or not it's pressed, so a
      // mouse works like a mouse; a finger only aims while down.
      if (aiming || !isTouch) aimAt(x, y);
    } else if (kind === "up") {
      if (aiming) {
        aimAt(x, y);
        aiming = false;
        fire();
      }
    } else {
      aiming = false;
    }
  }
  let isTouch = false;

  function key_(code: string, down: boolean): boolean {
    if (code === "ArrowLeft") {
      rotate = down ? 1 : rotate === 1 ? 0 : rotate;
      return true;
    }
    if (code === "ArrowRight") {
      rotate = down ? -1 : rotate === -1 ? 0 : rotate;
      return true;
    }
    return false;
  }

  /* ---- landing, matching, falling ---------------------------------- */

  function nearestFreeCell(x: number, y: number): Cell | null {
    const rowGuess = Math.round((y - r) / rowH);
    let best: Cell | null = null;
    let bestD = Infinity;
    for (let row = Math.max(0, rowGuess - 1); row <= rowGuess + 1; row++) {
      for (let col = 0; col < colsIn(row); col++) {
        if (grid.has(key(row, col))) continue;
        const c = center(row, col);
        const d = (c.x - x) ** 2 + (c.y - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { row, col };
        }
      }
    }
    return best;
  }

  function land(x: number, y: number, color: string) {
    const cell = nearestFreeCell(x, y);
    if (!cell) return;
    grid.set(key(cell.row, cell.col), color);

    // Same-colour cluster from the landed bubble.
    const cluster = flood(cell, (c) => grid.get(key(c.row, c.col)) === color);
    if (cluster.length >= 3) {
      for (const c of cluster) {
        const p = center(c.row, c.col);
        pops.push({ x: p.x, y: p.y, color, t: 0 });
        grid.delete(key(c.row, c.col));
      }
      addScore(cluster.length * 10);

      // Anything no longer attached to the top row falls.
      const attached = new Set<string>();
      for (let col = 0; col < colsIn(0); col++) {
        if (!grid.has(key(0, col))) continue;
        for (const c of flood({ row: 0, col }, () => true)) attached.add(key(c.row, c.col));
      }
      let dropped = 0;
      for (const k of [...grid.keys()]) {
        if (attached.has(k)) continue;
        const [row, col] = k.split(",").map(Number);
        const p = center(row, col);
        falls.push({ x: p.x, y: p.y, vy: -60 - rnd() * 80, vx: (rnd() - 0.5) * 120, color: grid.get(k)! });
        grid.delete(k);
        dropped++;
      }
      if (dropped > 0) addScore(dropped * 20);
      if (dropped >= 4) banner = { text: `${dropped} dropped!`, t: 1.1 };

      if (grid.size === 0) {
        addScore(100);
        banner = { text: "Board clear! +100", t: 1.4 };
        for (let i = 0; i < 3; i++) addRowOnTop();
        shotsUntilPush = pushCadence();
      }
    }

    // The clock on the next row.
    shotsUntilPush--;
    if (shotsUntilPush <= 0) {
      addRowOnTop();
      pushes++;
      shotsUntilPush = pushCadence();
    }

    // Reaching the line is the end.
    if (lowestY() + r >= deadline()) die();

    // Never hand the player a colour that can't match anything.
    if (![...grid.values()].includes(current) && grid.size > 0) current = randomColor(true);
    if (![...grid.values()].includes(next) && grid.size > 0) next = randomColor(true);
  }

  // Shots between pushes: six to start, down to four as the run goes on.
  function pushCadence() {
    return Math.max(4, 6 - Math.floor(pushes / 5));
  }

  function flood(start: Cell, ok: (c: Cell) => boolean): Cell[] {
    const seen = new Set<string>([key(start.row, start.col)]);
    const out: Cell[] = [start];
    const stack: Cell[] = [start];
    while (stack.length) {
      const c = stack.pop()!;
      for (const n of neighbours(c.row, c.col)) {
        const k = key(n.row, n.col);
        if (seen.has(k) || !grid.has(k) || !ok(n)) continue;
        seen.add(k);
        out.push(n);
        stack.push(n);
      }
    }
    return out;
  }

  /* ---- simulation --------------------------------------------------- */

  function step(dt: number) {
    if (rotate !== 0) setAngle(angle + rotate * 1.9 * dt);

    if (shot) {
      // Sub-steps so a fast bubble can't pass through a gap.
      const steps = Math.max(1, Math.ceil((SHOT_SPEED * dt) / (r * 0.5)));
      const h = dt / steps;
      for (let i = 0; i < steps && shot; i++) {
        shot.x += shot.dx * h;
        shot.y += shot.dy * h;
        if (shot.x < r) {
          shot.x = r;
          shot.dx = Math.abs(shot.dx);
        } else if (shot.x > width - r) {
          shot.x = width - r;
          shot.dx = -Math.abs(shot.dx);
        }
        if (shot.y <= r) {
          const s = shot;
          shot = null;
          land(s.x, r, s.color);
          break;
        }
        let hit = false;
        for (const k of grid.keys()) {
          const [row, col] = k.split(",").map(Number);
          const c = center(row, col);
          const d = (c.x - shot.x) ** 2 + (c.y - shot.y) ** 2;
          if (d < (2 * r * 0.88) ** 2) {
            hit = true;
            break;
          }
        }
        if (hit) {
          const s = shot;
          shot = null;
          land(s.x, s.y, s.color);
          break;
        }
      }
    }

    for (const p of pops) p.t += dt;
    pops = pops.filter((p) => p.t < 0.3);
    for (const f of falls) {
      f.vy += 1800 * dt;
      f.y += f.vy * dt;
      f.x += f.vx * dt;
    }
    falls = falls.filter((f) => f.y < height + r * 2);
    if (banner) {
      banner.t -= dt;
      if (banner.t <= 0) banner = null;
    }
  }

  /* ---- drawing ------------------------------------------------------ */

  function bubble(x: number, y: number, radius: number, color: string, alpha = 1) {
    const c = ctx!;
    c.globalAlpha = alpha;
    c.beginPath();
    c.arc(x, y, radius, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
    // A darker rim and a highlight, so the five colours read as glass.
    c.lineWidth = 1.5;
    c.strokeStyle = "rgba(14,15,17,0.55)";
    c.stroke();
    const g = c.createRadialGradient(x - radius * 0.35, y - radius * 0.4, radius * 0.1, x, y, radius);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.5, "rgba(255,255,255,0.08)");
    g.addColorStop(1, "rgba(0,0,0,0.18)");
    c.fillStyle = g;
    c.fill();
    c.globalAlpha = 1;
  }

  function draw() {
    const c = ctx!;
    c.clearRect(0, 0, width, height);

    // Grid of bubbles.
    for (const [k, color] of grid) {
      const [row, col] = k.split(",").map(Number);
      const p = center(row, col);
      bubble(p.x, p.y, r - 1, color);
    }

    // Pops swell and fade; falls just fall.
    for (const p of pops) {
      const k = p.t / 0.3;
      bubble(p.x, p.y, (r - 1) * (1 + k * 0.6), p.color, 1 - k);
    }
    for (const f of falls) bubble(f.x, f.y, r - 1, f.color, 0.9);

    // The line the bubbles must not reach.
    const dl = deadline();
    c.setLineDash([6, 6]);
    c.strokeStyle = "rgba(255,107,107,0.55)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, dl);
    c.lineTo(width, dl);
    c.stroke();
    c.setLineDash([]);

    // Shooter zone.
    c.fillStyle = "rgba(14,15,17,0.35)";
    c.fillRect(0, dl, width, height - dl);

    const sx = shooterX();
    const sy = shooterY();

    if (state === "running") {
      // Aim: dots along the path, with one wall bounce.
      let x = sx;
      let y = sy;
      let dx = Math.cos(angle);
      let dy = -Math.sin(angle);
      let bounced = false;
      c.fillStyle = "rgba(233,235,238,0.45)";
      for (let i = 0; i < 60; i++) {
        x += dx * 14;
        y += dy * 14;
        if (x < r || x > width - r) {
          if (bounced) break;
          bounced = true;
          dx = -dx;
          x = Math.max(r, Math.min(width - r, x));
        }
        if (y < r) break;
        let blocked = false;
        for (const k of grid.keys()) {
          const [row, col] = k.split(",").map(Number);
          const p = center(row, col);
          if ((p.x - x) ** 2 + (p.y - y) ** 2 < (2 * r * 0.88) ** 2) {
            blocked = true;
            break;
          }
        }
        if (blocked) break;
        c.beginPath();
        c.arc(x, y, 2, 0, Math.PI * 2);
        c.fill();
      }
    }

    // The bubble in flight.
    if (shot) bubble(shot.x, shot.y, r - 1, shot.color);

    // The shooter: current bubble on a small ring, next one beside it.
    c.strokeStyle = "rgba(141,147,156,0.5)";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(sx, sy, r + 5, 0, Math.PI * 2);
    c.stroke();
    if (state !== "over") bubble(sx, sy, r - 1, current);

    c.font = `700 ${Math.max(10, r * 0.62)}px "Archivo", system-ui, sans-serif`;
    c.textBaseline = "middle";
    c.fillStyle = "#8d939c";
    c.textAlign = "right";
    c.fillText("NEXT", sx + r * 3.1, sy);
    bubble(sx + r * 4.2, sy, r * 0.7, next);

    // Score, bottom left; rows-until-push, under it.
    c.textAlign = "left";
    c.fillStyle = "#8d939c";
    c.font = `700 ${Math.max(9, r * 0.55)}px "Archivo", system-ui, sans-serif`;
    c.fillText("SCORE", 12, dl + 18);
    c.fillStyle = "#e9ebee";
    c.font = `700 ${Math.max(14, r * 1.1)}px "Space Mono", ui-monospace, monospace`;
    c.fillText(score.toLocaleString("en-US"), 12, dl + 40);
    if (state === "running") {
      c.fillStyle = "#8d939c";
      c.font = `700 ${Math.max(9, r * 0.55)}px "Archivo", system-ui, sans-serif`;
      c.fillText(`NEW ROW IN ${shotsUntilPush}`, 12, dl + 62);
    }

    if (banner) {
      const k = Math.min(1, banner.t / 0.3);
      c.globalAlpha = k;
      c.textAlign = "center";
      c.fillStyle = "#ff7a2f";
      c.font = `700 ${Math.max(16, r * 1.3)}px "Archivo Black", "Archivo", sans-serif`;
      c.fillText(banner.text, width / 2, dl - r * 2.2);
      c.globalAlpha = 1;
    }

    if (flash > 0) {
      c.fillStyle = `rgba(255,107,107,${flash * 0.8})`;
      c.fillRect(0, 0, width, height);
    }
  }

  /* ---- loop --------------------------------------------------------- */

  function frame(now: number) {
    if (destroyed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === "running") step(dt);
    else {
      for (const p of pops) p.t += dt;
      pops = pops.filter((p) => p.t < 0.3);
      for (const f of falls) {
        f.vy += 1800 * dt;
        f.y += f.vy * dt;
      }
      falls = falls.filter((f) => f.y < height + r * 2);
    }
    if (flash > 0) flash = Math.max(0, flash - dt);
    draw();
    if (state === "running" || flash > 0 || pops.length || falls.length) {
      raf = requestAnimationFrame(frame);
    }
  }
  function loop() {
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function onVisibility() {
    if (document.visibilityState === "visible") {
      if (state === "running") loop();
    } else {
      cancelAnimationFrame(raf);
    }
  }
  document.addEventListener("visibilitychange", onVisibility);

  // A touch pointer only aims while it's down (see pointer()).
  isTouch = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

  draw();

  return {
    press,
    release,
    pointer,
    key: key_,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
