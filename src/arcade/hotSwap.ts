import type { ArcadeHandle, GameCallbacks, GameState, PointerKind } from "./types";
import { play } from "./sound";

/**
 * Hot Swap — Pentra's match-three (supabase/97).
 *
 * MARZ (2026-10-05): "add a Bejeweled style game. This should track
 * scores and have a leaderboard. Come up with a unique name."
 *
 * An 8×8 board of chips in six colours (each also its own shape, so
 * nobody has to tell teal from green in a hurry). Swap two neighbours
 * to line up three or more; they clear, the column drops, new chips
 * fall in, and anything that lines up on the way down clears too —
 * a cascade, worth more each step. A swap that makes nothing swaps
 * straight back. Sixty seconds on the clock; the score is what you
 * have when it runs out. A board with no moves reshuffles itself.
 *
 * Scoring: 10 a chip, ×2 on the second step of a cascade, ×3 on the
 * third and so on; a line of four is +20, five or more +50. A run of
 * excellent play lands around 3,000–6,000, so submit_arcade_score's
 * cap of 300 a second (97) is well clear of honest play.
 *
 * Controls: tap a chip then a neighbour, or drag a chip toward a
 * neighbour. Space starts and restarts.
 */

const SIZE = 8;
const ROUND_MS = 60_000;
const HUD = 52; // px above the board for score and clock
const SWAP_MS = 130;
const CLEAR_MS = 160;
const FALL_SPEED = 14; // cells per second, accelerating
const HINT_AFTER_MS = 4000;
const RESTART_LOCK_MS = 450;

// Six chips: colour and shape go together.
const CHIPS = [
  { color: "#ff7a2f", shape: "circle" },
  { color: "#e9ebee", shape: "diamond" },
  { color: "#a66cff", shape: "hexagon" },
  { color: "#2ad4c8", shape: "triangle" },
  { color: "#8bff3a", shape: "square" },
  { color: "#ff4fa3", shape: "pentagon" },
] as const;

type Cell = {
  type: number;
  /** Cells above its resting place while falling (0 = at rest). */
  drop: number;
  /** Clear animation progress, 0..1, or -1 when not clearing. */
  clearing: number;
};

type Phase = "idle" | "swapping" | "clearing" | "falling";

export function mountHotSwap(canvas: HTMLCanvasElement, callbacks: GameCallbacks): ArcadeHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  let width = 360;
  let height = 420;
  let cell = 40;
  let dpr = 1;
  let state: GameState = "ready";
  let raf = 0;
  let last = 0;
  let destroyed = false;
  let seed = Math.floor(Math.random() * 1e9) || 1;

  // The round.
  let grid: Cell[][] = [];
  let phase: Phase = "idle";
  let score = 0;
  let shownScore = -1;
  let startedAt = 0;
  let diedAt = 0;
  let timeLeft = ROUND_MS;
  let cascade = 0;
  let selected: { r: number; c: number } | null = null;
  let swap: { a: { r: number; c: number }; b: { r: number; c: number }; t: number; back: boolean } | null = null;
  let clearT = 0;
  let idleMs = 0;
  let hint: { a: { r: number; c: number }; b: { r: number; c: number } } | null = null;
  let banner: { text: string; t: number } | null = null;
  let drag: { r: number; c: number; x: number; y: number } | null = null;
  let flash = 0;

  function rnd() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const boardX = () => Math.floor((width - cell * SIZE) / 2);
  const boardY = () => HUD;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(240, Math.round(rect.width));
    cell = Math.floor((width - 8) / SIZE);
    height = HUD + cell * SIZE + 8;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = `${height}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state !== "running") draw();
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);
  resize();

  /* ---- board logic ------------------------------------------------- */

  function at(r: number, c: number): Cell | null {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE ? grid[r][c] : null;
  }

  /** Every cell that is part of a run of three or more. */
  function findMatches(): Set<string> {
    const out = new Set<string>();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const t = grid[r][c].type;
        if (t < 0) continue;
        // Horizontal run starting here.
        if (c === 0 || grid[r][c - 1].type !== t) {
          let len = 1;
          while (c + len < SIZE && grid[r][c + len].type === t) len++;
          if (len >= 3) for (let i = 0; i < len; i++) out.add(`${r},${c + i}`);
        }
        if (r === 0 || grid[r - 1][c].type !== t) {
          let len = 1;
          while (r + len < SIZE && grid[r + len][c].type === t) len++;
          if (len >= 3) for (let i = 0; i < len; i++) out.add(`${r + i},${c}`);
        }
      }
    }
    return out;
  }

  function swapTypes(a: { r: number; c: number }, b: { r: number; c: number }) {
    const t = grid[a.r][a.c].type;
    grid[a.r][a.c].type = grid[b.r][b.c].type;
    grid[b.r][b.c].type = t;
  }

  function makesMatch(a: { r: number; c: number }, b: { r: number; c: number }): boolean {
    swapTypes(a, b);
    const m = findMatches();
    swapTypes(a, b);
    return m.size > 0;
  }

  function findMove(): { a: { r: number; c: number }; b: { r: number; c: number } } | null {
    const moves: { a: { r: number; c: number }; b: { r: number; c: number } }[] = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (c + 1 < SIZE && makesMatch({ r, c }, { r, c: c + 1 })) moves.push({ a: { r, c }, b: { r, c: c + 1 } });
        if (r + 1 < SIZE && makesMatch({ r, c }, { r: r + 1, c })) moves.push({ a: { r, c }, b: { r: r + 1, c } });
      }
    }
    if (moves.length === 0) return null;
    return moves[Math.floor(rnd() * moves.length)];
  }

  /** A fresh board with no matches already on it and at least one move. */
  function fillBoard() {
    for (let tries = 0; tries < 100; tries++) {
      grid = [];
      for (let r = 0; r < SIZE; r++) {
        const row: Cell[] = [];
        for (let c = 0; c < SIZE; c++) {
          let t: number;
          do {
            t = Math.floor(rnd() * CHIPS.length);
          } while (
            (c >= 2 && row[c - 1].type === t && row[c - 2].type === t) ||
            (r >= 2 && grid[r - 1][c].type === t && grid[r - 2][c].type === t)
          );
          row.push({ type: t, drop: 0, clearing: -1 });
        }
        grid.push(row);
      }
      if (findMove()) return;
    }
  }

  /** Reshuffle in place (same chips, new places) until there's a move. */
  function reshuffle() {
    const types: number[] = [];
    for (const row of grid) for (const cl of row) types.push(cl.type);
    for (let tries = 0; tries < 100; tries++) {
      for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
      }
      let k = 0;
      for (const row of grid) for (const cl of row) cl.type = types[k++];
      if (findMatches().size === 0 && findMove()) break;
    }
    banner = { text: "No moves — reshuffled", t: 1.4 };
  }

  /* ---- the round ---------------------------------------------------- */

  function reset() {
    score = 0;
    shownScore = -1;
    timeLeft = ROUND_MS;
    cascade = 0;
    selected = null;
    swap = null;
    hint = null;
    idleMs = 0;
    banner = null;
    drag = null;
    flash = 0;
    phase = "idle";
    fillBoard();
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

  function end() {
    state = "over";
    diedAt = performance.now();
    selected = null;
    hint = null;
    flash = 0.25;
    play("drop");
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

  function press() {
    if (state === "ready") begin();
    else if (state === "over" && performance.now() - diedAt > RESTART_LOCK_MS) begin();
  }
  function release() {
    /* nothing held */
  }

  function adjacent(a: { r: number; c: number }, b: { r: number; c: number }) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  function trySwap(a: { r: number; c: number }, b: { r: number; c: number }) {
    if (phase !== "idle" || !adjacent(a, b)) return;
    selected = null;
    hint = null;
    idleMs = 0;
    const ok = makesMatch(a, b);
    swap = { a, b, t: 0, back: !ok };
    phase = "swapping";
    cascade = 0;
    play(ok ? "click" : "deny");
  }

  function cellAt(x: number, y: number): { r: number; c: number } | null {
    const c = Math.floor((x - boardX()) / cell);
    const r = Math.floor((y - boardY()) / cell);
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE ? { r, c } : null;
  }

  function pointer(kind: PointerKind, x: number, y: number) {
    if (state !== "running") {
      if (kind === "down") press();
      return;
    }
    if (kind === "down") {
      const hit = cellAt(x, y);
      if (!hit) {
        selected = null;
        return;
      }
      if (selected && adjacent(selected, hit)) {
        trySwap(selected, hit);
      } else if (selected && selected.r === hit.r && selected.c === hit.c) {
        selected = null;
      } else {
        selected = hit;
        play("click");
      }
      drag = { ...hit, x, y };
      idleMs = 0;
    } else if (kind === "move") {
      // Drag a chip toward a neighbour: once the finger has moved most
      // of a cell, that's the swap.
      if (!drag || phase !== "idle") return;
      const dx = x - drag.x;
      const dy = y - drag.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < cell * 0.45) return;
      const to =
        Math.abs(dx) > Math.abs(dy)
          ? { r: drag.r, c: drag.c + Math.sign(dx) }
          : { r: drag.r + Math.sign(dy), c: drag.c };
      const from = { r: drag.r, c: drag.c };
      drag = null;
      if (at(to.r, to.c)) trySwap(from, to);
    } else {
      drag = null;
    }
  }

  /* ---- simulation --------------------------------------------------- */

  function step(dt: number) {
    timeLeft -= dt * 1000;
    if (timeLeft <= 0) {
      timeLeft = 0;
      // Let a cascade in progress finish before the whistle.
      if (phase === "idle") {
        end();
        return;
      }
    }

    if (phase === "idle") {
      idleMs += dt * 1000;
      if (idleMs > HINT_AFTER_MS && !hint) hint = findMove();
    }

    if (phase === "swapping" && swap) {
      swap.t += (dt * 1000) / SWAP_MS;
      if (swap.t >= 1) {
        swapTypes(swap.a, swap.b);
        if (swap.back) {
          // It made nothing: the swap we just applied is the way back.
          swap = null;
          phase = "idle";
        } else {
          swap = null;
          resolve();
        }
      }
    } else if (phase === "clearing") {
      clearT += (dt * 1000) / CLEAR_MS;
      for (const row of grid) for (const cl of row) if (cl.clearing >= 0) cl.clearing = Math.min(1, clearT);
      if (clearT >= 1) collapse();
    } else if (phase === "falling") {
      let moving = false;
      for (const row of grid) {
        for (const cl of row) {
          if (cl.drop > 0) {
            cl.drop = Math.max(0, cl.drop - FALL_SPEED * dt * (1 + (1 - Math.min(1, cl.drop / 4)) * 0.5));
            if (cl.drop > 0) moving = true;
          }
        }
      }
      if (!moving) resolve();
    }

    if (banner) {
      banner.t -= dt;
      if (banner.t <= 0) banner = null;
    }
  }

  /** After a swap or a fall: clear what matches, or go idle. */
  function resolve() {
    const m = findMatches();
    if (m.size === 0) {
      phase = "idle";
      cascade = 0;
      if (!findMove()) reshuffle();
      return;
    }
    cascade++;
    // Score: count runs for the length bonuses.
    let points = m.size * 10;
    for (let r = 0; r < SIZE; r++) {
      let len = 0;
      for (let c = 0; c <= SIZE; c++) {
        if (c < SIZE && m.has(`${r},${c}`)) len++;
        else {
          if (len >= 5) points += 50;
          else if (len === 4) points += 20;
          len = 0;
        }
      }
    }
    for (let c = 0; c < SIZE; c++) {
      let len = 0;
      for (let r = 0; r <= SIZE; r++) {
        if (r < SIZE && m.has(`${r},${c}`)) len++;
        else {
          if (len >= 5) points += 50;
          else if (len === 4) points += 20;
          len = 0;
        }
      }
    }
    points *= cascade;
    addScore(points);
    if (cascade >= 2) {
      banner = { text: `×${cascade} cascade`, t: 0.9 };
      play("match");
    } else {
      play("pop", Math.min(6, m.size));
    }
    for (const k of m) {
      const [r, c] = k.split(",").map(Number);
      grid[r][c].clearing = 0;
    }
    clearT = 0;
    phase = "clearing";
  }

  /** Remove cleared chips, drop the rest, pour new ones in from above. */
  function collapse() {
    for (let c = 0; c < SIZE; c++) {
      // Survivors, bottom first, remembering where they were.
      const survivors: { cell: Cell; oldRow: number }[] = [];
      for (let r = SIZE - 1; r >= 0; r--) {
        if (grid[r][c].clearing < 0) survivors.push({ cell: grid[r][c], oldRow: r });
      }
      const missing = SIZE - survivors.length;
      const column: Cell[] = new Array(SIZE);
      // Survivors settle from the bottom up; each falls by the number
      // of cleared chips that were beneath it.
      survivors.forEach((s, i) => {
        const newRow = SIZE - 1 - i;
        s.cell.drop = newRow - s.oldRow;
        column[newRow] = s.cell;
      });
      // New chips fill the top rows, starting stacked above the board
      // so they pour in as one block.
      for (let r = 0; r < missing; r++) {
        column[r] = { type: Math.floor(rnd() * CHIPS.length), drop: missing, clearing: -1 };
      }
      for (let r = 0; r < SIZE; r++) grid[r][c] = column[r];
    }
    phase = "falling";
  }

  /* ---- drawing ------------------------------------------------------ */

  function chip(x: number, y: number, size: number, type: number, alpha = 1) {
    const c = ctx!;
    const { color, shape } = CHIPS[type];
    const r = size * 0.36;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    c.fillStyle = color;
    c.beginPath();
    switch (shape) {
      case "circle":
        c.arc(0, 0, r, 0, Math.PI * 2);
        break;
      case "diamond":
        c.moveTo(0, -r * 1.1);
        c.lineTo(r * 0.85, 0);
        c.lineTo(0, r * 1.1);
        c.lineTo(-r * 0.85, 0);
        c.closePath();
        break;
      case "hexagon":
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          const px = Math.cos(a) * r * 1.05;
          const py = Math.sin(a) * r * 1.05;
          if (i === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.closePath();
        break;
      case "triangle":
        c.moveTo(0, -r * 1.05);
        c.lineTo(r * 1.0, r * 0.75);
        c.lineTo(-r * 1.0, r * 0.75);
        c.closePath();
        break;
      case "square":
        c.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
        break;
      case "pentagon":
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          const px = Math.cos(a) * r * 1.05;
          const py = Math.sin(a) * r * 1.05;
          if (i === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.closePath();
        break;
    }
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = "rgba(14,15,17,0.6)";
    c.stroke();
    // Gloss.
    const g = c.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, "rgba(255,255,255,0.5)");
    g.addColorStop(0.5, "rgba(255,255,255,0.06)");
    g.addColorStop(1, "rgba(0,0,0,0.2)");
    c.fillStyle = g;
    c.fill();
    c.restore();
  }

  function draw() {
    const c = ctx!;
    c.clearRect(0, 0, width, height);
    const bx = boardX();
    const by = boardY();
    const now = performance.now();

    // HUD: score left, clock right, time bar under them.
    c.textBaseline = "middle";
    c.textAlign = "left";
    c.fillStyle = "#8d939c";
    c.font = `700 11px "Archivo", system-ui, sans-serif`;
    c.fillText("SCORE", bx + 2, 14);
    c.fillStyle = "#e9ebee";
    c.font = `700 20px "Space Mono", ui-monospace, monospace`;
    c.fillText(score.toLocaleString("en-US"), bx + 2, 32);
    const secs = Math.ceil(timeLeft / 1000);
    c.textAlign = "right";
    c.fillStyle = "#8d939c";
    c.font = `700 11px "Archivo", system-ui, sans-serif`;
    c.fillText("TIME", bx + cell * SIZE - 2, 14);
    c.fillStyle = state === "running" && secs <= 10 ? "#ff6b6b" : "#e9ebee";
    c.font = `700 20px "Space Mono", ui-monospace, monospace`;
    c.fillText(state === "ready" ? "1:00" : `0:${String(secs).padStart(2, "0")}`, bx + cell * SIZE - 2, 32);
    c.fillStyle = "#2e3239";
    c.fillRect(bx, HUD - 8, cell * SIZE, 3);
    c.fillStyle = secs <= 10 ? "#ff6b6b" : "#ff7a2f";
    c.fillRect(bx, HUD - 8, (cell * SIZE * timeLeft) / ROUND_MS, 3);

    // Board.
    c.fillStyle = "#15171b";
    c.fillRect(bx, by, cell * SIZE, cell * SIZE);
    c.strokeStyle = "rgba(141,147,156,0.08)";
    c.lineWidth = 1;
    for (let i = 1; i < SIZE; i++) {
      c.beginPath();
      c.moveTo(bx + i * cell, by);
      c.lineTo(bx + i * cell, by + cell * SIZE);
      c.moveTo(bx, by + i * cell);
      c.lineTo(bx + cell * SIZE, by + i * cell);
      c.stroke();
    }

    // Chips. Only draw what's inside the board (falling chips come
    // from above it).
    c.save();
    c.beginPath();
    c.rect(bx, by, cell * SIZE, cell * SIZE);
    c.clip();
    const hintOn = hint && Math.sin(now / 150) > 0;
    for (let r = 0; r < SIZE; r++) {
      for (let col = 0; col < SIZE; col++) {
        const cl = grid[r]?.[col];
        if (!cl) continue;
        let x = bx + col * cell + cell / 2;
        let y = by + (r - cl.drop) * cell + cell / 2;
        let size = cell;
        let alpha = 1;
        if (swap) {
          const isA = swap.a.r === r && swap.a.c === col;
          const isB = swap.b.r === r && swap.b.c === col;
          if (isA || isB) {
            const other = isA ? swap.b : swap.a;
            const k = Math.min(1, swap.t);
            // Ease out; a bounced swap goes there and back.
            const e = swap.back ? Math.sin(k * Math.PI) * 0.5 : 1 - (1 - k) * (1 - k);
            x += (other.c - col) * cell * e;
            y += (other.r - r) * cell * e;
          }
        }
        if (cl.clearing >= 0) {
          size = cell * (1 - cl.clearing * 0.85);
          alpha = 1 - cl.clearing;
        }
        const isSel = selected && selected.r === r && selected.c === col;
        const isHint = hintOn && hint && ((hint.a.r === r && hint.a.c === col) || (hint.b.r === r && hint.b.c === col));
        if (isSel || isHint) {
          c.fillStyle = isSel ? "rgba(255,122,47,0.22)" : "rgba(139,255,58,0.16)";
          c.fillRect(bx + col * cell + 1, by + r * cell + 1, cell - 2, cell - 2);
        }
        chip(x, y, size, cl.type, alpha);
        if (isSel) {
          c.strokeStyle = "#ff7a2f";
          c.lineWidth = 2;
          c.strokeRect(bx + col * cell + 1.5, by + r * cell + 1.5, cell - 3, cell - 3);
        }
      }
    }
    c.restore();

    if (banner) {
      const k = Math.min(1, banner.t / 0.3);
      c.globalAlpha = k;
      c.textAlign = "center";
      c.fillStyle = "#ff7a2f";
      c.font = `700 ${Math.max(18, cell * 0.6)}px "Archivo Black", "Archivo", sans-serif`;
      c.fillText(banner.text, width / 2, by + cell * SIZE * 0.5);
      c.globalAlpha = 1;
    }

    if (flash > 0) {
      c.fillStyle = `rgba(255,122,47,${flash * 0.5})`;
      c.fillRect(0, 0, width, height);
    }
  }

  /* ---- loop --------------------------------------------------------- */

  function frame(now: number) {
    if (destroyed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === "running") step(dt);
    if (flash > 0) flash = Math.max(0, flash - dt);
    draw();
    if (state === "running" || flash > 0 || banner) raf = requestAnimationFrame(frame);
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

  fillBoard();
  draw();

  return {
    press,
    release,
    pointer,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
