/**
 * Arcade sound effects — short synthesised blips, no files, no music
 * (MARZ, 2026-10-05: "no music, just sounds"). Everything is made
 * with the Web Audio API on the spot, so there's nothing to load and
 * nothing to license. The context is created on the first play(),
 * which always happens inside a tap or key press, so browsers allow
 * it to start.
 *
 * One switch, per device, in localStorage; SoundToggle.tsx draws it.
 */

export type SoundName =
  | "jump"
  | "crash"
  | "shoot"
  | "pop"
  | "drop"
  | "click"
  | "deny"
  | "match"
  | "zap"
  | "tick"
  | "win";

const KEY = "pentra.arcadeSound";

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode; the session still works */
  }
}

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type ToneOpts = {
  type?: OscillatorType;
  from: number;
  to?: number;
  dur: number;
  gain: number;
  at?: number;
};

function tone(c: AudioContext, o: ToneOpts) {
  const t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.from, t0);
  if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

function noise(c: AudioContext, dur: number, gain: number, cutoff: number, at = 0) {
  const t0 = c.currentTime + at;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = cutoff;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}

/** Play a named effect. Silent when the switch is off or audio is unavailable. */
export function play(name: SoundName, detail = 1) {
  if (!soundOn()) return;
  let c: AudioContext | null;
  try {
    c = context();
  } catch {
    return;
  }
  if (!c) return;
  try {
    switch (name) {
      case "jump":
        tone(c, { type: "triangle", from: 320, to: 680, dur: 0.11, gain: 0.22 });
        break;
      case "crash":
        noise(c, 0.28, 0.5, 900);
        tone(c, { type: "square", from: 120, to: 45, dur: 0.3, gain: 0.25 });
        break;
      case "shoot":
        tone(c, { type: "square", from: 720, to: 280, dur: 0.1, gain: 0.14 });
        break;
      case "pop": {
        // A cluster pops as a quick run of pops, rising a little.
        const n = Math.min(6, Math.max(1, Math.round(detail)));
        for (let i = 0; i < n; i++) {
          tone(c, { type: "sine", from: 520 + i * 60, to: 380 + i * 40, dur: 0.1, gain: 0.2, at: i * 0.045 });
          noise(c, 0.05, 0.12, 2400, i * 0.045);
        }
        break;
      }
      case "drop":
        tone(c, { type: "sine", from: 420, to: 140, dur: 0.28, gain: 0.2 });
        tone(c, { type: "sine", from: 630, to: 210, dur: 0.28, gain: 0.1, at: 0.04 });
        break;
      case "click":
        tone(c, { type: "sine", from: 1500, to: 1100, dur: 0.035, gain: 0.12 });
        break;
      case "deny":
        tone(c, { type: "square", from: 170, to: 150, dur: 0.09, gain: 0.1 });
        break;
      case "match":
        tone(c, { type: "triangle", from: 660, dur: 0.12, gain: 0.18 });
        tone(c, { type: "triangle", from: 990, dur: 0.16, gain: 0.18, at: 0.08 });
        break;
      case "zap":
        tone(c, { type: "sawtooth", from: 1100, to: 180, dur: 0.26, gain: 0.16 });
        noise(c, 0.2, 0.25, 3000);
        break;
      case "tick":
        // The last-ten-seconds beep; the final one is a touch higher.
        tone(c, { type: "square", from: detail >= 2 ? 1320 : 990, dur: 0.07, gain: 0.12 });
        break;
      case "win":
        [523, 659, 784, 1046].forEach((f, i) =>
          tone(c!, { type: "triangle", from: f, dur: 0.22, gain: 0.18, at: i * 0.1 }),
        );
        break;
    }
  } catch {
    /* a sound that fails is a sound nobody hears; the game goes on */
  }
}
