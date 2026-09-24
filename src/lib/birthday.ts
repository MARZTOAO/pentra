import { supabase } from "./supabase";
import { MIN_AGE } from "./constants";

/**
 * Date of birth, and the two once-a-year greetings.
 *
 * The date itself lives in a sealed table (supabase/69_birthdays.sql)
 * that nothing can read through the API. Everything here goes through
 * functions that only ever answer about the signed-in account.
 *
 * Dates travel as "YYYY-MM-DD" strings end to end — what an
 * <input type="date"> produces and what Postgres returns for a `date`.
 * Never through `new Date("YYYY-MM-DD")`, which reads it as UTC
 * midnight and shows the day before for everyone west of Greenwich.
 */

/** Split "YYYY-MM-DD" into numbers, or null if it isn't one. */
function parts(value: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  // Round-trip through a local date to reject Feb 30 and friends.
  const check = new Date(y, mo - 1, d);
  if (
    check.getFullYear() !== y ||
    check.getMonth() !== mo - 1 ||
    check.getDate() !== d
  ) {
    return null;
  }
  return [y, mo, d];
}

/** Today on this device, as "YYYY-MM-DD". Used as the date picker's max. */
export function todayIso(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

export type BirthDateCheck = "ok" | "invalid" | "too_young";

/**
 * The same question the database asks, asked first so a refusal
 * doesn't cost a round trip or surface as "Database error saving new
 * user". Uses this device's calendar, which is never more generous than
 * the server's (that allows a day's leeway for time zones ahead of UTC).
 */
export function checkBirthDate(value: string): BirthDateCheck {
  const p = parts(value);
  if (!p) return "invalid";

  const [y, mo, d] = p;
  if (y < 1900) return "invalid";

  const born = new Date(y, mo - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (born > today) return "invalid";

  // The day they turn MIN_AGE. A Feb 29 birthday lands on Mar 1 in a
  // year without one, which is the conservative reading.
  const comesOfAge = new Date(y + MIN_AGE, mo - 1, d);
  return comesOfAge <= today ? "ok" : "too_young";
}

/** "4 July 1995" or "July 4, 1995", depending on where you are. */
export function formatBirthDate(value: string): string {
  const p = parts(value);
  if (!p) return value;
  const [y, mo, d] = p;
  return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * This device's time zone, e.g. "America/Chicago".
 *
 * Sent with every celebration call so "your birthday" means your
 * calendar day, not UTC's. The server falls back to UTC for anything
 * it doesn't recognise.
 */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/* ------------------------------------------------------------------ */
/*  The neutral age gate's memory.                                     */
/*                                                                     */
/*  After an under-age answer, the form stays closed on this device    */
/*  for a day. Otherwise the obvious next move is to press Back and    */
/*  pick an earlier year — which turns the question into instructions. */
/*  It's a speed bump, not a wall: clearing site data gets past it,    */
/*  and nothing better is possible without keeping details about       */
/*  someone who isn't old enough, which is worse.                      */
/* ------------------------------------------------------------------ */

const BLOCK_KEY = "pentra.signup.paused-until";
const BLOCK_MS = 24 * 60 * 60 * 1000;

export function signupPaused(): boolean {
  try {
    const until = Number(localStorage.getItem(BLOCK_KEY) ?? 0);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

export function pauseSignup() {
  try {
    localStorage.setItem(BLOCK_KEY, String(Date.now() + BLOCK_MS));
  } catch {
    // Storage blocked. The server check still holds.
  }
}

/* ------------------------------------------------------------------ */
/*  Server calls.                                                      */
/* ------------------------------------------------------------------ */

export type Celebrations = {
  birthday: boolean;
  anniversary_years: number;
  needs_birth_date: boolean;
};

/** What to show today, if anything. Null on any failure — say nothing. */
export async function getCelebrations(): Promise<Celebrations | null> {
  const { data, error } = await supabase.rpc("my_celebrations", {
    tz: localTimeZone(),
  });
  if (error || !data) return null;
  const row = (Array.isArray(data) ? data[0] : data) as Celebrations | undefined;
  return row ?? null;
}

export async function dismissCelebrations() {
  return supabase.rpc("dismiss_celebrations", { tz: localTimeZone() });
}

export async function dismissBirthDatePrompt() {
  return supabase.rpc("dismiss_birth_date_prompt");
}

/** Your own date of birth as "YYYY-MM-DD", or null if none is on file. */
export async function getMyBirthDate(): Promise<string | null> {
  const { data, error } = await supabase.rpc("my_birth_date");
  if (error || !data) return null;
  return String(data);
}

export type SetBirthDateResult =
  | "saved"
  | "already_set"
  | "too_young"
  | "invalid"
  | "signed_out"
  | "error";

export async function setBirthDate(value: string): Promise<SetBirthDateResult> {
  const { data, error } = await supabase.rpc("set_birth_date", { d: value });
  if (error) return "error";
  return (data as SetBirthDateResult) ?? "error";
}
