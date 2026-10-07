import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Giveaways (supabase/105_giveaways.sql).
 *
 * Opening the app is not entering: someone is only in the draw after
 * they type their TikTok username on the giveaway page, agree to the
 * rules and tap Enter. Bonus entries come from invites (46) that start
 * playing during the giveaway. The draw happens in DevPanel →
 * Giveaways, weighted by entries.
 */

export type Giveaway = {
  id: number;
  title: string;
  prize: string;
  prize_value_cents: number;
  image_url: string | null;
  starts_at: string;
  ends_at: string;
  tiktok_handle: string;
  referral_cap: number;
  winners_count: number;
  /** Entries being taken right now. */
  open: boolean;
};

export type MyEntry = {
  entered: boolean;
  tiktok: string | null;
  bonus: number;
  entries: number;
  has_top5: boolean;
  age: "ok" | "under" | "unknown";
};

export async function getCurrentGiveaway(): Promise<Giveaway | null> {
  const { data, error } = await supabase.rpc("current_giveaway");
  if (error || !data) return null;
  return data as Giveaway;
}

/** The giveaway that's on, or null. undefined while asking. */
export function useCurrentGiveaway(): Giveaway | null | undefined {
  const [g, setG] = useState<Giveaway | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    getCurrentGiveaway().then((v) => {
      if (active) setG(v);
    });
    return () => {
      active = false;
    };
  }, []);
  return g;
}

export async function getMyEntry(id: number): Promise<MyEntry | null> {
  const { data, error } = await supabase.rpc("my_giveaway", { p_id: id });
  if (error || !data) return null;
  return data as MyEntry;
}

/** @returns null when entered (or updated), or the problem. */
export async function enterGiveaway(id: number, tiktok: string, agree: boolean): Promise<string | null> {
  const { data, error } = await supabase.rpc("enter_giveaway", {
    p_id: id,
    p_tiktok: tiktok,
    p_agree: agree,
  });
  if (error) return error.message;
  return data === "entered" || data === "updated" ? null : (data as string) || "Couldn't enter.";
}

export type Rules = { id: number; title: string; rules: string; starts_at: string; ends_at: string };

export async function getRules(id: number): Promise<Rules | null> {
  const { data, error } = await supabase.rpc("giveaway_rules", { p_id: id });
  if (error || !data) return null;
  return data as Rules;
}

/** "Nov 16, 11:59 PM CST" in the reader's own time zone. */
export function whenText(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** "3 days left", "5 hours left", "Closed". */
export function timeLeft(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "Closed";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return `${Math.floor(hours / 24)} days left`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} left`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins} minute${mins === 1 ? "" : "s"} left`;
}

/* ------------------------------------------------------------------ */
/*  Developer (DevPanel → Giveaways)                                   */
/* ------------------------------------------------------------------ */

export type DevWinner = {
  id: number;
  status: "drawn" | "confirmed" | "skipped";
  drawn_at: string;
  weight: number;
  pool: number;
  tiktok: string;
  username: string | null;
  email: string | null;
  name: string | null;
};

export type DevGiveaway = Omit<Giveaway, "open"> & {
  rules: string;
  published: boolean;
  created_at: string;
  entrants: number;
  email_entrants: number;
  total_entries: number;
  winners: DevWinner[];
};

export type DevEntry = {
  id: number;
  tiktok: string;
  username: string | null;
  email: string | null;
  name: string | null;
  entered_at: string;
  entries: number;
};

export type GiveawayForm = {
  title: string;
  prize: string;
  prize_value_cents: number;
  image_url: string;
  starts_at: string; // ISO
  ends_at: string; // ISO
  tiktok_handle: string;
  referral_cap: number;
  winners_count: number;
  rules: string;
  published: boolean;
};

export async function devListGiveaways(): Promise<DevGiveaway[] | null> {
  const { data, error } = await supabase.rpc("dev_giveaways");
  if (error || !data) return null;
  return data as DevGiveaway[];
}

/** @returns the id, or the problem as a string. */
export async function devSaveGiveaway(id: number | null, f: GiveawayForm): Promise<number | string> {
  const { data, error } = await supabase.rpc("dev_giveaway_save", {
    p_id: id,
    p_title: f.title,
    p_prize: f.prize,
    p_prize_value_cents: f.prize_value_cents,
    p_image_url: f.image_url,
    p_starts_at: f.starts_at,
    p_ends_at: f.ends_at,
    p_tiktok_handle: f.tiktok_handle,
    p_referral_cap: f.referral_cap,
    p_winners_count: f.winners_count,
    p_rules: f.rules,
    p_published: f.published,
  });
  if (error) return error.message;
  const r = data as { id?: number; error?: string } | null;
  if (r?.id) return r.id;
  return r?.error ?? "Couldn't save.";
}

export async function devAddEmailEntry(id: number, name: string, email: string, tiktok: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("dev_giveaway_add_email_entry", {
    p_id: id,
    p_name: name,
    p_email: email,
    p_tiktok: tiktok,
  });
  if (error) return error.message;
  return data === "added" ? null : (data as string) || "Couldn't add.";
}

/** @returns null when a winner was drawn, or the problem. */
export async function devDraw(id: number): Promise<string | null> {
  const { data, error } = await supabase.rpc("dev_giveaway_draw", { p_id: id });
  if (error) return error.message;
  const r = data as { id?: number; error?: string } | null;
  return r?.id ? null : r?.error ?? "Couldn't draw.";
}

export async function devSetWinner(winnerId: number, status: DevWinner["status"]): Promise<string | null> {
  const { data, error } = await supabase.rpc("dev_giveaway_set_winner", {
    p_winner: winnerId,
    p_status: status,
  });
  if (error) return error.message;
  return data === "saved" ? null : (data as string) || "Couldn't save.";
}

export async function devListEntries(id: number): Promise<DevEntry[] | null> {
  const { data, error } = await supabase.rpc("dev_giveaway_entries", { p_id: id });
  if (error || !data) return null;
  return data as DevEntry[];
}
