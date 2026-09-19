import { supabase } from "./supabase";

/**
 * How you appear, and how you choose to appear.
 *
 * Two vocabularies on purpose, and the gap between them is the whole
 * feature. You pick from four; everyone else is only ever told one of
 * three. Invisible and offline both read as offline to other people,
 * and the database backs that up rather than the interface pretending
 * — see supabase/32_presence.sql.
 */

/** What you can pick. */
export type PresenceChoice = "online" | "away" | "invisible" | "offline";

/** What anyone else can learn. Note the absence of "invisible". */
export type PresenceState = "online" | "away" | "offline";

export const PRESENCE_OPTIONS: {
  key: PresenceChoice;
  label: string;
  hint: string;
}[] = [
  { key: "online", label: "Online", hint: "Available to play" },
  { key: "away", label: "Away", hint: "Here, but don't wait on a reply" },
  {
    key: "invisible",
    label: "Invisible",
    hint: "Use the app without anyone seeing you",
  },
  { key: "offline", label: "Appear offline", hint: "Same, but you mean it" },
];

/** The dot colour for a state. Away is amber — visibly not green. */
export const PRESENCE_COLOR: Record<PresenceState, string> = {
  online: "var(--color-ok)",
  away: "#e0a13a",
  offline: "var(--color-muted)",
};

export const PRESENCE_LABEL: Record<PresenceState, string> = {
  online: "online",
  away: "away",
  offline: "offline",
};

/** What the picker should show ticked — including "Invisible". */
export function choiceLabel(choice: PresenceChoice): string {
  return PRESENCE_OPTIONS.find((o) => o.key === choice)?.label ?? "Online";
}

/**
 * The dot that goes beside a choice in the picker.
 *
 * Invisible deliberately draws the hollow "offline" dot, because that
 * is what everyone else is seeing — the picker should show you the
 * truth about your own visibility, not flatter it.
 */
export function choiceState(choice: PresenceChoice): PresenceState {
  if (choice === "away") return "away";
  if (choice === "online") return "online";
  return "offline";
}

/** Someone counts as present if they've checked in within two minutes. */
const PRESENT_WINDOW_MS = 2 * 60 * 1000;

type PresenceSource = {
  /** The public column. Only ever online, away or offline. */
  presence?: string | null;
  last_seen_at?: string | null;
};

/**
 * What to draw for somebody else.
 *
 * Both halves have to agree. `presence` is what they chose, but a
 * player who picked "online" three days ago and closed the app is not
 * online now — the timestamp is what proves they're still here. And a
 * hidden player's timestamp is deliberately never refreshed, so they
 * fall out here without this function needing to know they exist.
 */
export function presenceOf(row: PresenceSource): PresenceState {
  const seen = row.last_seen_at;
  if (!seen) return "offline";
  if (Date.now() - new Date(seen).getTime() >= PRESENT_WINDOW_MS) {
    return "offline";
  }

  return row.presence === "away" ? "away" : "online";
}

/** Convenience for the many places that only care about the dot. */
export function isPresent(row: PresenceSource): boolean {
  return presenceOf(row) !== "offline";
}

/** Your own real choice, invisible included. */
export async function getMyPresence(): Promise<PresenceChoice> {
  const { data, error } = await supabase.rpc("my_presence");
  if (error || !data) return "online";
  return data as PresenceChoice;
}

export async function setPresence(choice: PresenceChoice) {
  return supabase.rpc("set_presence", { choice });
}

/**
 * Public presence for a set of players, in one query.
 *
 * The list screens get their rows from RPCs that predate this feature
 * and return `last_seen_at` but not `presence`. Adding a column to
 * those means dropping and recreating five functions of eighty-odd
 * lines each, since `create or replace` can't change a return type —
 * a lot of surface area to disturb for one extra field.
 *
 * `profiles` is publicly readable and the column is public-safe by
 * construction, so one batched lookup fills the gap instead. Returns a
 * map so callers can fold it into rows they already have.
 */
export async function getPresenceMap(
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from("profiles")
    .select("id, presence")
    .in("id", ids);

  if (error || !data) return {};

  const map: Record<string, string> = {};
  for (const row of data as { id: string; presence: string }[]) {
    map[row.id] = row.presence;
  }
  return map;
}
