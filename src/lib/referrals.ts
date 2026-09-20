import { supabase } from "./supabase";

/**
 * Invite links.
 *
 * A separate code from the friend code, on purpose: a friend code is
 * handed to people you know and can never be changed, while this one
 * gets pasted somewhere public and can be thrown away. See
 * supabase/46_referrals.sql.
 */

const STORAGE_KEY = "pentra.ref";

export type ReferralSummary = {
  code: string | null;
  /** How many people used the link. */
  total: number;
  /** How many of those actually started playing. Only these count. */
  qualified: number;
  can_roll: boolean;
};

/** What record_referral() reports. Most of these are not worth saying. */
export type ReferralResult =
  | "recorded"
  | "already_referred"
  | "too_late"
  | "unknown_code"
  | "self"
  | "no_code"
  | "signed_out";

/**
 * Pull ?ref= off the URL and keep it.
 *
 * Called once at startup, before anything routes. It has to be kept
 * rather than used immediately, because with email confirmation on,
 * somebody clicks the link, signs up, goes to their inbox and comes
 * back through a completely different URL — the code has to still be
 * around when their account finally exists.
 *
 * The app uses a HashRouter, so a shared link is a plain
 * `?ref=XXXXXX` on the root and lands in window.location.search
 * before the `#`.
 */
export function captureReferralFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("ref");
    if (!code) return;

    localStorage.setItem(STORAGE_KEY, code.trim().toUpperCase());

    // Take it back out of the address bar. Nobody needs to see it,
    // and leaving it there means it gets re-copied by anyone who
    // shares the page.
    params.delete("ref");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : "") + window.location.hash,
    );
  } catch {
    // Private mode, blocked storage, an exotic browser. A referral is
    // not worth breaking startup over.
  }
}

function storedReferral(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearStoredReferral() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * Hand the stored code to the database, if there is one.
 *
 * Called once a session exists. The code goes over, not a user id —
 * the database looks up who owns it. Anything the browser could name
 * directly would be a "type anybody's name here for free stuff"
 * button.
 */
export async function claimStoredReferral(): Promise<ReferralResult | null> {
  const code = storedReferral();
  if (!code) return null;

  const { data, error } = await supabase.rpc("record_referral", {
    want_code: code,
  });

  if (error) return null;

  // Every answer except a transport failure is final: the code was
  // used, or it never will be. Either way stop carrying it around.
  clearStoredReferral();

  return data as ReferralResult;
}

/** Your code, created on the first ask. */
export async function getMyReferralCode(): Promise<string | null> {
  const { data, error } = await supabase.rpc("my_referral_code");
  if (error || !data) return null;
  return data as string;
}

export async function rollReferralCode() {
  return supabase.rpc("roll_referral_code");
}

/**
 * Everything the panel needs, in one round trip.
 *
 * It used to be two: my_referral_code() to make sure a code existed,
 * then referral_summary() to read it, because the summary is `stable`
 * and a stable function may not create anything. referral_panel()
 * does both — see supabase/48_stats_performance.sql.
 */
export async function getReferralPanel(): Promise<ReferralSummary | null> {
  const { data, error } = await supabase.rpc("referral_panel").maybeSingle();
  if (error || !data) return null;
  return data as ReferralSummary;
}

/** The thing people actually paste. */
export function referralLink(code: string): string {
  return `${window.location.origin}/?ref=${code}`;
}
