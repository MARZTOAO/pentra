import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { rememberedCreatorCode } from "./billing";

/**
 * Ambassadors: creator partners who can see their own numbers
 * (supabase/104_ambassadors.sql).
 *
 * A developer links a creator code to the creator's own account in
 * DevPanel → Creators. That account then has an Ambassador page
 * (/ambassador) showing what the code has brought in. The database
 * decides who sees what: my_ambassador() only ever returns the
 * caller's own code, and only counts — never who signed up.
 */

export type MyAmbassador = {
  code: string;
  creator_name: string;
  active: boolean;
  tier_size: number;
  rates: { monthly: number; yearly: number; monthly_after: number; yearly_after: number };
  /** One-time bonus when a subscriber stays (supabase/106). */
  loyalty?: { monthly: number; yearly: number; monthly_after: number; yearly_after: number };
  refund_days: number;
  payouts: { amount_cents: number; paid_at: string }[];
  /** New accounts through their link. */
  signups: number;
  /** Of those, who played a session or made 3 friends. */
  signups_playing: number;
  signups_this_month: number;
  signups_last_month: number;
  monthly: number;
  yearly: number;
  /** Paid, still inside the refund window. */
  pending: number;
  /** Past the refund window: these earn. */
  payable: number;
  refunded: number;
  disputed: number;
  pro_this_month: number;
  pro_last_month: number;
  /** Subscribers who stayed long enough to earn the bonus (106). */
  loyalty_count?: number;
  loyalty_cents?: number;
  earned_cents: number;
  paid_cents: number;
  owed_cents: number;
  last_paid_at: string | null;
};

export type Leaderboard = {
  month: string;
  top: { place: number; name: string; count: number; me: boolean }[];
  my_place: number | null;
  my_count: number;
};

export async function getMyAmbassador(): Promise<MyAmbassador | null> {
  const { data, error } = await supabase.rpc("my_ambassador");
  if (error || !data) return null;
  return data as MyAmbassador;
}

export async function getLeaderboard(): Promise<Leaderboard | null> {
  const { data, error } = await supabase.rpc("ambassador_leaderboard");
  if (error || !data) return null;
  return data as Leaderboard;
}

/** False until the answer comes back, and for nearly everyone after. */
export function useIsAmbassador(userId: string | undefined): boolean {
  const [yes, setYes] = useState(false);
  useEffect(() => {
    if (!userId) {
      setYes(false);
      return;
    }
    let active = true;
    supabase.rpc("am_i_ambassador").then(({ data }) => {
      if (active) setYes(data === true);
    });
    return () => {
      active = false;
    };
  }, [userId]);
  return yes;
}

const CLAIMED_KEY = "pentra.creatorSignupClaimed";

/**
 * If this person arrived on a creator link (pentra.gg/?creator=CODE),
 * tell the database once they have an account, so the creator gets
 * credit for the sign-up. The code itself stays remembered for the
 * upgrade page; only the "already told the database" mark is new.
 *
 * Called once a session exists, next to claimStoredReferral. The
 * database only accepts it for accounts under a week old.
 */
export async function claimCreatorSignup(): Promise<void> {
  const code = rememberedCreatorCode();
  if (!code) return;

  try {
    if (localStorage.getItem(CLAIMED_KEY) === code) return;
  } catch {
    /* blocked storage: ask anyway, the database answers "already" */
  }

  const { error } = await supabase.rpc("record_creator_signup", { p_code: code });
  if (error) return; // try again next time

  try {
    localStorage.setItem(CLAIMED_KEY, code);
  } catch {
    /* nothing to do */
  }
}
