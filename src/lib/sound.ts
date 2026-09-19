/**
 * The app's three notification sounds.
 *
 * Synthesised rather than loaded from files: three short beeps are a
 * few lines of maths, and shipping them as audio means three assets to
 * host, license and download before the first one can ever play.
 *
 * They are deliberately quiet and short. A notification sound is heard
 * hundreds of times by someone who uses the app properly, and anything
 * with a tail or a flourish stops being information and becomes an
 * irritation on about the fifth hearing. Peak gain is 0.06 — clearly
 * audible, never startling.
 *
 * The three are related but distinguishable: same timbre, different
 * shapes. A message rises, a friend request is three warm notes, a
 * general notification is a single tap. You should be able to tell
 * which happened without looking.
 */

export type Tone = "message" | "friendRequest" | "notification";

/** Per-device, not per-account: sound on the desktop and silence on a
 *  phone in a meeting is a reasonable thing to want. */
const MUTE_KEY = "pentra.sound.muted";

type Note = {
  /** Hz. */
  hz: number;
  /** Seconds from the start of the sound. */
  at: number;
  /** Seconds. */
  length: number;
};

const TONES: Record<Tone, Note[]> = {
  // Two notes rising — "something arrived".
  message: [
    { hz: 660, at: 0, length: 0.09 },
    { hz: 880, at: 0.08, length: 0.13 },
  ],
  // Three notes, the last one held. Warmer, and clearly not a message.
  friendRequest: [
    { hz: 523.25, at: 0, length: 0.09 },
    { hz: 659.25, at: 0.09, length: 0.09 },
    { hz: 783.99, at: 0.18, length: 0.2 },
  ],
  // A single tap. The default, and the one heard most often.
  notification: [{ hz: 880, at: 0, length: 0.14 }],
};

const PEAK = 0.06;

let context: AudioContext | null = null;

/**
 * Browsers refuse to start audio until the person has interacted with
 * the page, and a context created before that starts suspended. So it
 * is created lazily on the first sound, and a one-time listener nudges
 * it awake on the first click or keypress.
 */
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;

  if (!context) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;

    try {
      context = new Ctor();
    } catch {
      return null;
    }
  }

  if (context.state === "suspended") void context.resume();
  return context;
}

if (typeof window !== "undefined") {
  const wake = () => {
    const ctx = context;
    if (ctx && ctx.state === "suspended") void ctx.resume();
  };
  window.addEventListener("pointerdown", wake, { passive: true });
  window.addEventListener("keydown", wake, { passive: true });
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    // Private windows and blocked site data both throw here. Defaulting
    // to audible is the honest choice: the person never asked for
    // silence, and a muted app with no way to tell is worse.
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Nothing to do. The toggle still works for this session.
  }
}

/**
 * Plays one of the three. Silent — never throwing — if audio isn't
 * available, which is the right failure: nobody's evening should be
 * interrupted by an error because a beep didn't work.
 */
export function play(tone: Tone) {
  if (isMuted()) return;

  const ctx = audio();
  if (!ctx) return;

  try {
    const start = ctx.currentTime + 0.01;

    for (const note of TONES[tone]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // A triangle rather than a sine: a touch more character, without
      // the harshness of a square that makes repeated beeps grating.
      osc.type = "triangle";
      osc.frequency.value = note.hz;

      const from = start + note.at;
      const to = from + note.length;

      // Attack, hold, release. The hold matters: with a bare attack
      // and an exponential release, a 140ms note is only about 50ms
      // above the threshold of hearing and lands as a click rather
      // than a beep. Measured, then fixed.
      //
      // Ramps rather than hard edges at both ends, because a waveform
      // jumping straight from silence to full amplitude is itself an
      // audible click.
      const release = Math.min(0.055, note.length * 0.45);
      gain.gain.setValueAtTime(0.0001, from);
      gain.gain.exponentialRampToValueAtTime(PEAK, from + 0.012);
      gain.gain.setValueAtTime(PEAK, to - release);
      gain.gain.exponentialRampToValueAtTime(0.0001, to);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(from);
      osc.stop(to + 0.02);
    }
  } catch {
    // Ignore.
  }
}

/** Plays a tone so someone can hear what they're turning on. */
export function preview(tone: Tone = "notification") {
  const wasMuted = isMuted();
  setMuted(false);
  play(tone);
  setMuted(wasMuted);
}
