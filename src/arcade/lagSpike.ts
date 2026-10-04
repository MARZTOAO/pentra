/**
 * Lag Spike — Pentra's first arcade game (supabase/93).
 *
 * An endless runner in the spirit of the dinosaur in Chrome: you are
 * the signal, running down the wire; lag spikes rise out of it; jump
 * them. The run speeds up until it doesn't matter how good you are.
 *
 * No framework in here on purpose. This file owns the canvas, the
 * loop, the physics and the drawing, and talks to React through the
 * callbacks in ./types. ArcadeGame.tsx mounts it, draws the overlays (score,
 * start / game-over screens, leaderboards) in ordinary HTML on top,
 * and sends the finished run to the database.
 *
 * Scoring is distance: about 10 points a second at the start, about
 * 22 a second at full speed. submit_arcade_score (93) refuses
 * anything above 40 a second, so keep SPEED_MAX / SCORE_DIVISOR
 * inside that if they are ever retuned.
 */

import type { ArcadeHandle, GameCallbacks, GameState } from "./types";
import { play } from "./sound";

type Spike = { x: number; w: number; h: number; hit?: boolean };

// World tuning. Units are CSS pixels and seconds.
const HEIGHT = 220;
const GROUND = HEIGHT - 30;
const PLAYER_X = 64;
const PLAYER_R = 13;
// Retuned 2026-10-05 ("too lofty"): heavier gravity with a stronger
// jump keeps the same height (~95px) in less air time (0.54s vs 0.61s).
const GRAVITY = 2600;
const JUMP_V = -700;
const HOLD_GRAVITY = 0.52; // gravity while the button is held and still rising
const SPEED_START = 320;
const SPEED_MAX = 700;
const SPEED_RAMP = 14; // px/s gained per second
const SCORE_DIVISOR = 32; // points per second = speed / this
const RESTART_LOCK_MS = 450; // ignore presses right after dying

// Colours: the app's Carbon palette, kept in step with index.css.
const C = {
  wire: "#2e3239",
  wireLit: "#3a3f48",
  ink: "#e9ebee",
  muted: "#8d939c",
  accent: "#ff7a2f",
  accentHi: "#ff9354",
  danger: "#ff6b6b",
  grid: "rgba(141,147,156,0.10)",
};

export function mountLagSpike(canvas: HTMLCanvasElement, callbacks: GameCallbacks): ArcadeHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  let width = 600;
  let dpr = 1;
  let state: GameState = "ready";
  let raf = 0;
  let last = 0;
  let destroyed = false;

  // The run.
  let speed = SPEED_START;
  let score = 0;
  let shownScore = -1;
  let startedAt = 0;
  let diedAt = 0;
  let py = GROUND; // player's feet
  let vy = 0;
  let held = false;
  let spikes: Spike[] = [];
  let nextSpawnIn = 0;
  let scroll = 0; // for the ground ticks and grid
  let flash = 0; // death flash, seconds left
  let squash = 0; // landing squash, seconds left
  let seed = Math.floor(Math.random() * 1e9);

  // A tiny deterministic generator so the obstacle pattern isn't
  // Math.random's — easier to reason about and to tune.
  function rnd() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(320, Math.round(rect.width));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    canvas.style.height = `${HEIGHT}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state !== "running") draw();
  }

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);
  resize();

  function reset() {
    speed = SPEED_START;
    score = 0;
    shownScore = -1;
    py = GROUND;
    vy = 0;
    spikes = [];
    nextSpawnIn = 0.8;
    scroll = 0;
    flash = 0;
    squash = 0;
  }

  function begin() {
    reset();
    state = "running";
    startedAt = performance.now();
    last = startedAt;
    callbacks.onState(state);
    callbacks.onScore(0);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function die() {
    play("crash");
    state = "over";
    diedAt = performance.now();
    flash = 0.25;
    callbacks.onState(state);
    callbacks.onRunEnd({ score: Math.floor(score), durationMs: Math.round(diedAt - startedAt) });
  }

  function onGround() {
    return py >= GROUND - 0.01;
  }

  function jump() {
    if (state !== "running" || !onGround()) return;
    vy = JUMP_V;
    play("jump");
  }

  function press() {
    held = true;
    if (state === "ready") {
      begin();
      // A press that starts the run also jumps, like the dinosaur.
      vy = JUMP_V;
      play("jump");
      return;
    }
    if (state === "over") {
      if (performance.now() - diedAt > RESTART_LOCK_MS) {
        begin();
        vy = JUMP_V;
        play("jump");
      }
      return;
    }
    jump();
  }

  function release() {
    held = false;
  }

  // How far into the run we are, 0 at the start and 1 at full speed.
  // Everything that makes the game harder reads from this.
  function difficulty() {
    return Math.min(1, Math.max(0, (speed - SPEED_START) / (SPEED_MAX - SPEED_START)));
  }

  // Spikes come in groups; the gaps between groups are random and get
  // shorter as the run goes on, and the groups get bigger and taller.
  // The gap is measured in time at the current speed, not pixels: a
  // jump lasts the same ~0.6s no matter how fast the wire moves, so
  // the floor is "just enough to land and jump again" at any speed.
  function spawnGroup() {
    const d = difficulty();
    const r = rnd();
    // Group size: early on mostly singles and pairs; late, pairs to fours.
    const n =
      r < 0.45 - d * 0.35 ? 1
      : r < 0.85 - d * 0.25 ? 2
      : r < 0.97 - d * 0.1 ? 3
      : 4;
    const w = 15 + rnd() * 8;
    // One tall spike now and then that needs the held, higher jump.
    const tall = n === 1 && rnd() < 0.15 + d * 0.25;
    let x = width + 20;
    for (let i = 0; i < n; i++) {
      const h = tall ? 72 + rnd() * 12 : 24 + rnd() * (18 + d * 12);
      spikes.push({ x, w, h });
      x += w + 2;
    }
    // Seconds until the next group. The floor is a jump's air time
    // (land, jump straight away); the ceiling closes in with difficulty.
    const airTime = (2 * -JUMP_V) / GRAVITY; // ≈ 0.61s
    const minT = airTime * 0.95;
    const maxT = 1.9 - d * 1.05;
    // Squared so short gaps are the common case, long ones the breather.
    const t = minT + Math.pow(rnd(), 1.4) * (maxT - minT);
    nextSpawnIn = t + (n * (w + 2)) / Math.max(speed, 1);
  }

  function step(dt: number) {
    speed = Math.min(SPEED_MAX, speed + SPEED_RAMP * dt);
    score += (speed / SCORE_DIVISOR) * dt;
    scroll = (scroll + speed * dt) % 1000;

    // Player.
    const g = held && vy < 0 ? GRAVITY * HOLD_GRAVITY : GRAVITY;
    vy += g * dt;
    const wasAir = !onGround();
    py = Math.min(GROUND, py + vy * dt);
    if (py >= GROUND) {
      if (wasAir && vy > 300) squash = 0.12;
      vy = 0;
    }

    // Spikes.
    for (const s of spikes) s.x -= speed * dt;
    spikes = spikes.filter((s) => s.x + s.w > -10);
    nextSpawnIn -= dt;
    if (nextSpawnIn <= 0) spawnGroup();

    // Collision: three points along the bottom of the player's body
    // against each spike's surface. Forgiving at the edges on purpose
    // — a near miss should feel like a miss.
    const r = PLAYER_R * 0.78;
    const cx = PLAYER_X;
    const bottom = py - 2;
    for (const s of spikes) {
      if (s.x > cx + r || s.x + s.w < cx - r) continue;
      for (const px of [cx - r * 0.7, cx, cx + r * 0.7]) {
        if (px < s.x || px > s.x + s.w) continue;
        const half = s.w / 2;
        const surface = GROUND - s.h * (1 - Math.abs(px - (s.x + half)) / half);
        if (bottom > surface) {
          s.hit = true;
          die();
          return;
        }
      }
    }

    const whole = Math.floor(score);
    if (whole !== shownScore) {
      shownScore = whole;
      callbacks.onScore(whole);
    }
  }

  function pentagon(x: number, y: number, radius: number) {
    ctx!.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const px = x + Math.cos(a) * radius;
      const py2 = y + Math.sin(a) * radius;
      if (i === 0) ctx!.moveTo(px, py2);
      else ctx!.lineTo(px, py2);
    }
    ctx!.closePath();
  }

  function draw() {
    const c = ctx!;
    c.clearRect(0, 0, width, HEIGHT);

    // A faint grid drifting slower than the ground, for depth.
    c.strokeStyle = C.grid;
    c.lineWidth = 1;
    const gridStep = 40;
    const gx = -((scroll * 0.35) % gridStep);
    c.beginPath();
    for (let x = gx; x < width; x += gridStep) {
      c.moveTo(x, 0);
      c.lineTo(x, GROUND);
    }
    for (let y = GROUND - gridStep; y > 0; y -= gridStep) {
      c.moveTo(0, y);
      c.lineTo(width, y);
    }
    c.stroke();

    // The wire.
    c.strokeStyle = C.wireLit;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, GROUND + 1);
    c.lineTo(width, GROUND + 1);
    c.stroke();
    // Ticks along it so the ground visibly moves.
    c.strokeStyle = C.wire;
    c.lineWidth = 1;
    c.beginPath();
    const tick = 28;
    for (let x = -(scroll % tick); x < width; x += tick) {
      c.moveTo(x, GROUND + 6);
      c.lineTo(x + 10, GROUND + 6);
    }
    c.stroke();

    // Spikes: jagged, red at the tip, with a light edge.
    for (const s of spikes) {
      const mid = s.x + s.w / 2;
      const grad = c.createLinearGradient(0, GROUND, 0, GROUND - s.h);
      grad.addColorStop(0, "rgba(255,107,107,0.35)");
      grad.addColorStop(1, s.hit ? C.ink : C.danger);
      c.fillStyle = grad;
      c.beginPath();
      c.moveTo(s.x, GROUND + 1);
      c.lineTo(s.x + s.w * 0.28, GROUND - s.h * 0.55);
      c.lineTo(mid, GROUND - s.h);
      c.lineTo(s.x + s.w * 0.72, GROUND - s.h * 0.6);
      c.lineTo(s.x + s.w, GROUND + 1);
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(233,235,238,0.55)";
      c.lineWidth = 1;
      c.stroke();
    }

    // The player: a pentagon node — the Pentra mark's shape — with a
    // glow, squashed a touch on landing and tilted in the air.
    const sq = squash > 0 ? 1 - squash * 2.2 : 1;
    const air = !onGround();
    const y = py - PLAYER_R * sq;
    c.save();
    c.translate(PLAYER_X, y);
    c.scale(1 / Math.sqrt(sq), sq);
    if (air) c.rotate(Math.max(-0.35, Math.min(0.35, vy / 2000)));
    c.shadowColor = C.accent;
    c.shadowBlur = state === "over" ? 4 : 14;
    c.fillStyle = state === "over" ? C.muted : C.accent;
    pentagon(0, 0, PLAYER_R);
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = state === "over" ? C.ink : C.accentHi;
    pentagon(0, -1, PLAYER_R * 0.42);
    c.fill();
    c.restore();

    // Trail while running: a few fading nodes behind.
    if (state === "running") {
      for (let i = 1; i <= 3; i++) {
        c.globalAlpha = 0.22 - i * 0.06;
        c.fillStyle = C.accent;
        pentagon(PLAYER_X - i * 11, y + (air ? i * 3 : 0), PLAYER_R * (1 - i * 0.18));
        c.fill();
      }
      c.globalAlpha = 1;
    }

    if (flash > 0) {
      c.fillStyle = `rgba(255,107,107,${flash * 0.9})`;
      c.fillRect(0, 0, width, HEIGHT);
    }
  }

  function frame(now: number) {
    if (destroyed) return;
    // Cap the step so a background tab coming back doesn't teleport
    // every spike through the player.
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === "running") step(dt);
    if (squash > 0) squash = Math.max(0, squash - dt);
    if (flash > 0) flash = Math.max(0, flash - dt);
    draw();
    if (state === "running" || flash > 0 || squash > 0) {
      raf = requestAnimationFrame(frame);
    }
  }

  // A hidden tab stops the clock rather than letting spikes pile up.
  function onVisibility() {
    if (document.visibilityState === "visible") {
      last = performance.now();
      if (state === "running") {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
      }
    } else {
      cancelAnimationFrame(raf);
    }
  }
  document.addEventListener("visibilitychange", onVisibility);

  draw();

  return {
    press,
    release,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
