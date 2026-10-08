import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Pentra Pets (supabase/110_pets.sql).
 *
 * Behind the `pets` feature flag: nothing here is called unless
 * useFlag("pets") is true for the viewer. Everyone gets an egg the
 * first time they open their own profile with the flag on; it hatches
 * into one of ten species after their first session or 24 hours. Three
 * meters (hunger, mood, energy), three stages (XP), snacks to feed it.
 * All the rules are numbers in pet_rules() on the server and come back
 * in `rules` so the copy here never drifts from what the server does.
 */

export type PetRules = {
  hatch_hours: number;
  hunger_days: number;
  mood_days: number;
  energy_refill_hours: number;
  feed_hunger: number;
  play_mood: number;
  play_energy: number;
  play_cooldown_hours: number;
  /** Catches in the Play mini game for the full mood boost. */
  play_target: number;
  rest_cooldown_hours: number;
  snack_free_hours: number;
  snack_cap: number;
  xp_care: number;
  xp_session: number;
  xp_commend: number;
  xp_arcade: number;
  stage2_xp: number;
  stage3_xp: number;
  cheer_mood: number;
  new_egg_days: number;
};

export type Pet = {
  user_id: string;
  is_egg: boolean;
  egg_at: string;
  hatches_at: string;
  warmed_today: boolean;
  warmed_days: number;
  species: string | null;
  species_name: string | null;
  trait: string | null;
  shape: string | null;
  color: string | null;
  edge: string | null;
  stage: 1 | 2 | 3;
  name: string | null;
  stage_name: string | null;
  hunger: number;
  mood: number;
  energy: number;
  xp: number;
  next_stage_xp: number | null;
  snacks: number;
  hatched_at: string | null;
  fed_at: string | null;
  played_at: string | null;
  age_days: number;
  can_play_at: string;
  can_rest_at: string;
  cared_today: boolean;
  /** Pentra Pro: a new egg any time. */
  pro: boolean;
  /** When the owner may next trade this pet for a new egg (now = ready). */
  can_new_egg_at: string;
  napping: boolean;
  cheered_today: boolean;
  cheers_today: number;
  rules: PetRules;
};

export type PetAction = "warm" | "feed" | "play" | "rest" | "rename" | "new_egg";

type PetResult = { pet: Pet | null; error: string | null };

function unwrap(data: unknown, error: { message: string } | null): PetResult {
  if (error) return { pet: null, error: "Something went wrong. Try again." };
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    return { pet: null, error: String((data as { error: unknown }).error) };
  }
  return { pet: (data as Pet | null) ?? null, error: null };
}

/** Someone's pet. Your own egg is created the first time you ask. */
export async function getPet(userId?: string): Promise<Pet | null> {
  const { data, error } = await supabase.rpc("get_pet", { p_user: userId ?? null });
  if (error || !data) return null;
  return data as Pet;
}

export async function petAct(action: PetAction, name?: string, score?: number): Promise<PetResult> {
  const { data, error } = await supabase.rpc("pet_act", {
    p_action: action,
    p_name: name ?? null,
    p_score: score ?? null,
  });
  return unwrap(data, error);
}

export async function petCheer(userId: string): Promise<PetResult> {
  const { data, error } = await supabase.rpc("pet_cheer", { p_user: userId });
  return unwrap(data, error);
}

/**
 * A pet that keeps itself fresh: refetched on focus and every minute,
 * since meters drift and eggs hatch on their own. `set` lets an action
 * drop the row the server just returned straight in.
 */
export function usePet(userId: string | undefined, enabled: boolean) {
  const [pet, setPet] = useState<Pet | null | undefined>(undefined);

  const reload = useCallback(async () => {
    if (!userId || !enabled) return;
    setPet(await getPet(userId));
  }, [userId, enabled]);

  useEffect(() => {
    if (!userId || !enabled) {
      setPet(undefined);
      return;
    }
    let active = true;
    getPet(userId).then((p) => {
      if (active) setPet(p);
    });
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 60_000);
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearInterval(tick);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, enabled, reload]);

  return { pet, setPet, reload };
}

/** The mood a mini-game score earns: full at play_target, never under 30%. */
export function playBoost(score: number, rules: PetRules): number {
  return Math.round(rules.play_mood * Math.min(1, Math.max(0.3, score / rules.play_target)));
}

/** "in 2h 10m", or "" once the moment has passed. */
export function untilText(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
  const d = Math.floor(h / 24);
  return `in ${d}d ${h % 24}h`;
}

/** One line on how the pet is doing, for the card. */
export function petMoodText(p: Pet): string {
  if (p.is_egg) return "Still an egg.";
  if (p.hunger <= 0) return "Starving. Napping until it's fed.";
  if (p.mood <= 0) return "Miserable. Napping until someone plays with it.";
  if (p.hunger < 30) return "Hungry.";
  if (p.energy < 20) return "Worn out.";
  if (p.mood < 40) return "A bit bored.";
  if (p.mood >= 85 && p.hunger >= 60) return "Happy.";
  return "Doing fine.";
}

/** "Fed 3h ago" style stamps. */
export function agoText(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export type DevPetAction = "give" | "hatch" | "evolve" | "fill" | "starve" | "reset";

/** Developer only (dev_pet checks am_i_developer()). Skips the waiting. */
export async function devPet(userId: string, action: DevPetAction): Promise<PetResult> {
  const { data, error } = await supabase.rpc("dev_pet", { p_user: userId, p_action: action });
  return unwrap(data, error);
}
