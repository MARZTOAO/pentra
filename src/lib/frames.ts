import { useEffect, useReducer } from "react";
import { supabase } from "./supabase";
import { hasPlus } from "./profile";

/**
 * Avatar frames — a Pentra Pro perk.
 *
 * Every frame is drawn in code (components/AvatarFrame.tsx), so there
 * is nothing to host and it scales to any avatar size. This file is
 * the list, and the small cache that lets a frame show up everywhere
 * an avatar does without every screen's query having to know about it.
 *
 * Who may wear one is decided in the database (supabase/78): picking
 * a frame without Pro is refused, and a lapsed member's frame is
 * cleared. The app also only draws a frame for a profile that is Pro
 * right now, so nothing lingers.
 */

export type Frame = {
  key: string;
  label: string;
  blurb: string;
  /** Seconds per full turn. Omitted = still. Honours reduced-motion. */
  spin?: number;
  /** Turn the other way. */
  reverse?: boolean;
};

export const FRAMES: Frame[] = [
  { key: "ember", label: "Ember", blurb: "Warm ring, soft glow." },
  { key: "bezel", label: "Bezel", blurb: "Gold, with tick marks.", spin: 60 },
  { key: "circuit", label: "Circuit", blurb: "Segmented arcs, four nodes.", spin: 24 },
  { key: "notch", label: "Notch", blurb: "Eight sides, Pentra style." },
  { key: "frost", label: "Frost", blurb: "Ice ring, crystal points.", spin: 45, reverse: true },
  { key: "magma", label: "Magma", blurb: "Flames off a molten ring.", spin: 36 },
  { key: "halo", label: "Halo", blurb: "Pink-to-blue ring in a soft haze." },
  { key: "orbit", label: "Orbit", blurb: "Three moons on their own rings.", spin: 30 },
  { key: "crown", label: "Crown", blurb: "Gold ring with a five-point crest." },
  { key: "radar", label: "Radar", blurb: "A green sweep, always scanning.", spin: 8 },
  { key: "vortex", label: "Vortex", blurb: "Three arcs spiralling inward.", spin: 18 },
  { key: "storm", label: "Storm", blurb: "Jagged electric blue." },
];

export function findFrame(key: string | null | undefined) {
  if (!key) return null;
  return FRAMES.find((f) => f.key === key) ?? null;
}

/** How far a frame reaches past the avatar: box = avatar × this. */
export const FRAME_SCALE = 1.3;

/**
 * The frame a profile should show right now: its chosen frame, but
 * only while it is a Pro member. Mirrors the trigger in 78.
 */
export function frameOf(p: {
  avatar_frame?: string | null;
  tier?: "free" | "plus" | null;
  tier_expires_at?: string | null;
}): string | null {
  if (!p.avatar_frame || !p.tier) return null;
  if (!hasPlus({ tier: p.tier, tier_expires_at: p.tier_expires_at ?? null })) return null;
  return findFrame(p.avatar_frame) ? p.avatar_frame : null;
}

// ---------------------------------------------------------------
//  The cache.
//
//  Feed, sessions, friends, chat, search — they all get avatars from
//  database functions that return username, avatar_url and
//  avatar_preset, and nothing else. Rather than rewrite every one of
//  those functions to add a column, the Avatar component asks here,
//  by username. Unknown names are collected for a few milliseconds and
//  fetched in one request; the answer is kept for a while; everyone
//  showing that avatar re-renders when it arrives.
//
//  The same lookup also answers "is this person Pro right now?" — the
//  gold posts in the feed need it (useIsPro below), and it comes from
//  the same row, so it costs nothing extra.
// ---------------------------------------------------------------

const FRESH_FOR = 5 * 60 * 1000;   // a known answer is good for 5 min
const RETRY_AFTER = 30 * 1000;     // a failed request isn't repeated sooner
const BATCH_DELAY = 40;            // ms to wait for more names
const BATCH_SIZE = 100;

type Entry = { frame: string | null; pro: boolean; until: number };

const cache = new Map<string, Entry>();        // lower-case username → answer
const spelling = new Map<string, string>();    // lower-case → as given
const listeners = new Set<() => void>();
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  listeners.forEach((fn) => fn());
}

function want(lower: string) {
  const known = cache.get(lower);
  if (known && known.until > Date.now()) return;
  pending.add(lower);
  if (timer === null) timer = setTimeout(flush, BATCH_DELAY);
}

async function flush() {
  timer = null;
  const names = [...pending];
  pending = new Set();
  if (names.length === 0) return;

  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    const chunk = names.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("profiles")
      .select("username, avatar_frame, tier, tier_expires_at")
      .in("username", chunk.map((l) => spelling.get(l) ?? l));

    const now = Date.now();
    if (error || !data) {
      for (const l of chunk) {
        if (!cache.has(l)) cache.set(l, { frame: null, pro: false, until: now + RETRY_AFTER });
        else cache.get(l)!.until = now + RETRY_AFTER;
      }
      continue;
    }

    const seen = new Set<string>();
    for (const row of data as {
      username: string;
      avatar_frame: string | null;
      tier: "free" | "plus";
      tier_expires_at: string | null;
    }[]) {
      const l = row.username.toLowerCase();
      seen.add(l);
      cache.set(l, {
        frame: frameOf(row),
        pro: hasPlus({ tier: row.tier, tier_expires_at: row.tier_expires_at }),
        until: now + FRESH_FOR,
      });
    }
    // Names that came back empty (deleted account, or a name that
    // never existed): no frame, and don't ask again for a while.
    for (const l of chunk) {
      if (!seen.has(l)) cache.set(l, { frame: null, pro: false, until: now + FRESH_FOR });
    }
  }

  notify();
}

/**
 * The frame to draw for this username, or null. Fetches in the
 * background the first time a name is seen and re-renders when it
 * knows. Pass `explicit` to skip the lookup (a preview in the picker,
 * or a screen that already loaded the profile).
 */
export function useAvatarFrame(
  username: string | null | undefined,
  explicit?: string | null,
): string | null {
  const lower = username ? username.toLowerCase() : null;
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (explicit !== undefined || !lower) return;
    spelling.set(lower, username!);
    want(lower);
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, [lower, username, explicit]);

  if (explicit !== undefined) return findFrame(explicit) ? explicit : null;
  if (!lower) return null;
  return cache.get(lower)?.frame ?? null;
}

/**
 * After saving your own frame: tell every avatar of yours on screen,
 * without a round trip.
 */
export function rememberFrame(username: string, frame: string | null) {
  const lower = username.toLowerCase();
  // Only someone with Pro can save a frame, so a frame means Pro; no
  // frame keeps whatever we already knew.
  const pro = frame !== null || (cache.get(lower)?.pro ?? false);
  cache.set(lower, { frame, pro, until: Date.now() + FRESH_FOR });
  notify();
}

/**
 * Whether this username is a Pentra Pro member right now, from the same
 * cached lookup as avatar frames. False until it knows. Pass `explicit`
 * when the screen already has the answer (your own profile).
 */
export function useIsPro(
  username: string | null | undefined,
  explicit?: boolean,
): boolean {
  const lower = username ? username.toLowerCase() : null;
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (explicit !== undefined || !lower) return;
    spelling.set(lower, username!);
    want(lower);
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, [lower, username, explicit]);

  if (explicit !== undefined) return explicit;
  if (!lower) return false;
  return cache.get(lower)?.pro ?? false;
}
