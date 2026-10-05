import { useEffect, useState } from "react";
import { registerPlugin } from "@capacitor/core";
import { supabase } from "./supabase";
import { isDesktopApp, isNativeApp, openExternal } from "./platform";

/**
 * Pentra Pro billing — the app's side.
 *
 * Payment happens on Stripe's own checkout page; Pentra never sees a
 * card. The 'pro' Edge Function (supabase/functions/pro) makes the
 * checkout and "manage billing" pages and listens to Stripe; the
 * database (supabase/87) is the record. This file asks for those pages
 * and reads your status.
 *
 * Whether buying is open at all is the `pro_sales` flag — testers only
 * while Stripe is in test mode, everyone from launch.
 */

export type Plan = "monthly" | "yearly";

/** Prices, for display. Stripe is the source of truth for what's charged. */
export const PRICES = {
  monthly: { perMonth: 5.99, billed: 5.99, label: "Monthly", note: "Billed every month" },
  yearly: { perMonth: 4.99, billed: 59.88, label: "Yearly", note: "Billed $59.88 once a year" },
} as const;

/** What a creator code takes off the first payment. */
export const CREATOR_DISCOUNT = { monthly: 25, yearly: 30 } as const;

/** Days after the first payment that a full refund can be asked for. */
export const REFUND_DAYS = 14;

export type MyBilling = {
  pro: boolean;
  /** Pro with no end date (a grant), so there's nothing to buy. */
  permanent: boolean;
  expires_at: string | null;
  has_customer: boolean;
  first_time: boolean;
  subscription: null | {
    plan: Plan;
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: string | null;
  };
};

/**
 * Is Pro on sale to the public? Reads the "everyone" half of the
 * `pro_sales` flag, signed out or in — for the website, which has no
 * session to ask `my_flags` with. Inside the app use
 * `useFlag("pro_sales")`, which also counts testers.
 *
 * Starts false, like useFlag: pricing appears a moment late rather
 * than flashing up for everyone before launch.
 */
export function useProOnSale(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let active = true;
    supabase
      .rpc("pro_on_sale")
      .then(({ data }) => {
        if (active) setOn(data === true);
      });
    return () => {
      active = false;
    };
  }, []);
  return on;
}

export async function getMyBilling(): Promise<MyBilling | null> {
  const { data, error } = await supabase.rpc("my_billing");
  if (error || !data) return null;
  return data as MyBilling;
}

/** A subscription that will charge again. */
export function renews(b: MyBilling | null): boolean {
  const s = b?.subscription;
  return Boolean(s && ["active", "trialing", "past_due"].includes(s.status) && !s.cancel_at_period_end);
}

export type CodeCheck = { ok: boolean; code: string | null; creator_name: string | null; first_time: boolean };

export async function checkCreatorCode(code: string): Promise<CodeCheck | null> {
  const { data, error } = await supabase.rpc("check_creator_code", { p_code: code });
  if (error || !data) return null;
  return data as CodeCheck;
}

/* ------------------------------------------------------------------ */
/*  Creator links: pentra.gg/?creator=CODE                             */
/* ------------------------------------------------------------------ */

const CREATOR_KEY = "pentra.creatorCode";

/**
 * Remembers a creator's code from a link, so it's already filled in
 * when the viewer reaches the upgrade page — possibly days later,
 * after signing up. Called once at startup, next to the referral link
 * capture (which uses ?ref= for player invites).
 */
export function captureCreatorFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("creator");
    if (!code) return;
    localStorage.setItem(CREATOR_KEY, code.trim().toUpperCase().slice(0, 20));
    params.delete("creator");
    const query = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
  } catch {
    /* blocked storage: the viewer can still type the code */
  }
}

export function rememberedCreatorCode(): string {
  try {
    return localStorage.getItem(CREATOR_KEY) ?? "";
  } catch {
    return "";
  }
}

export function forgetCreatorCode() {
  try {
    localStorage.removeItem(CREATOR_KEY);
  } catch {
    /* nothing to do */
  }
}

/* ------------------------------------------------------------------ */
/*  Where Pro can be sold                                              */
/* ------------------------------------------------------------------ */

/**
 * The iPhone app's own Swift code (ios/App/App/Storefront.swift): which
 * country's App Store this iPhone is signed in to.
 */
const Storefront = registerPlugin<{
  getCountryCode(): Promise<{ countryCode: string }>;
}>("Storefront");

let sellsHere: Promise<boolean> | null = null;

/**
 * May this copy of Pentra show Pro's checkout and billing buttons?
 *
 * On the website and in the Windows app: always.
 *
 * In the iPhone app: only for the US App Store. Since May 2025 Apple
 * lets US apps link to buying on the web (App Review Guideline 3.1.1);
 * everywhere else, an app that points people at outside payment gets
 * rejected. The App Store's country is not the phone's language or
 * location: it's the Apple account's, which only iOS can tell us. If it
 * can't be read, the answer is no — hiding a button is a smaller
 * mistake than a rejection.
 *
 * Re-check Guideline 3.1.1 before every App Store submission.
 */
export function canSellProHere(): Promise<boolean> {
  if (!isNativeApp()) return Promise.resolve(true);
  sellsHere ??= Storefront.getCountryCode()
    .then((r) => r.countryCode === "USA")
    .catch(() => false);
  return sellsHere;
}

/**
 * canSellProHere() as a hook. null while the iPhone app is still
 * asking (a moment, once per launch); callers that just hide a button
 * can treat that as false.
 */
export function useSellsProHere(): boolean | null {
  const [here, setHere] = useState<boolean | null>(isNativeApp() ? null : true);
  useEffect(() => {
    if (!isNativeApp()) return;
    let active = true;
    canSellProHere().then((v) => {
      if (active) setHere(v);
    });
    return () => {
      active = false;
    };
  }, []);
  return here;
}

/* ------------------------------------------------------------------ */
/*  Opening Stripe                                                     */
/* ------------------------------------------------------------------ */

type FnResult = { url?: string; error?: string; message?: string };

async function callPro(body: Record<string, unknown>): Promise<FnResult> {
  const { data, error } = await supabase.functions.invoke("pro", { body });
  if (data && typeof data === "object") return data as FnResult;
  // A non-2xx reply arrives as an error whose context is the response.
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.json()) as FnResult;
    } catch {
      /* fall through */
    }
  }
  return { error: "network", message: "Couldn't reach Pentra. Check your connection and try again." };
}

/**
 * Sends the player to Stripe. In a browser that's this tab (Stripe
 * brings them back to pentra.gg/#/pro); in the desktop app it's their
 * own browser, and in the iPhone app a Safari sheet over the app —
 * either way the app notices Pro arriving when they come back.
 *
 * @returns null once Stripe is opening, or a sentence to show.
 */
async function go(body: Record<string, unknown>): Promise<string | null> {
  const r = await callPro(body);
  if (!r.url) return r.message ?? "Something went wrong. Try again in a minute.";
  if (isDesktopApp() || isNativeApp()) await openExternal(r.url);
  else window.location.assign(r.url);
  return null;
}

export function startCheckout(plan: Plan, code: string): Promise<string | null> {
  return go({ action: "checkout", plan, code: code.trim() || undefined });
}

export function openBillingPortal(): Promise<string | null> {
  return go({ action: "portal" });
}

/* ------------------------------------------------------------------ */
/*  Developer: creator partners and refund checks (supabase/87)        */
/* ------------------------------------------------------------------ */

export type CreatorRow = {
  code: string;
  creator_name: string;
  contact: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  monthly: number;
  yearly: number;
  pending: number;
  refunded: number;
  /** Disputed with the bank (supabase/100); missing before 100 is run. */
  disputed?: number;
  payable: number;
  earned_cents: number;
  paid_cents: number;
  owed_cents: number;
  last_paid_at: string | null;
};

export async function listCreators(): Promise<CreatorRow[] | null> {
  const { data, error } = await supabase.rpc("dev_creator_codes");
  if (error || !data) return null;
  return data as CreatorRow[];
}

async function devText(fn: string, args: Record<string, unknown>, ok: string): Promise<string | null> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return error.message;
  return data === ok ? null : (data as string) || "Couldn't save.";
}

export const addCreator = (code: string, name: string, contact: string) =>
  devText("dev_creator_add", { p_code: code, p_name: name, p_contact: contact || null }, "added");

export const setCreatorActive = (code: string, active: boolean) =>
  devText("dev_creator_set_active", { p_code: code, p_active: active }, "saved");

export const recordPayout = (code: string, cents: number, note: string) =>
  devText("dev_creator_payout", { p_code: code, p_amount_cents: cents, p_note: note || null }, "recorded");

export type BillingLookup = {
  username: string;
  customer_id: string | null;
  refunds_used: number;
  payments: {
    invoice_id: string;
    plan: Plan;
    amount_cents: number;
    currency: string;
    paid_at: string;
    first_payment: boolean;
    creator_code: string | null;
    refunded_at: string | null;
    refundable: boolean;
  }[];
};

/** @returns the player's payments, null for no such player, or a string error. */
export async function lookupBilling(username: string): Promise<BillingLookup | null | string> {
  const { data, error } = await supabase.rpc("dev_billing_lookup", { who: username });
  if (error) return error.message;
  return (data as BillingLookup | null) ?? null;
}

export const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
