import { supabase } from "./supabase";

/**
 * "While you were gone."
 *
 * The database decides whether there is anything to say — it returns
 * no rows when there isn't, and no rows while the welcome dialog is
 * still pending, so two modals can never stack on a first run. See
 * supabase/49_changelog.sql.
 *
 * ONLY WHAT THIS COPY HAS. Every call sends BUILT_AT, and the database
 * lists only entries written before this build was made
 * (supabase/71_changelog_by_build.sql). A desktop copy that hasn't
 * updated isn't told about features it doesn't have — those are shown
 * on the update card instead, as a reason to install.
 */

/**
 * When this copy of the app was built. Set by vite.config.ts — on
 * Vercel for the website, in the release workflow for the desktop app,
 * and at start-up for `npm run tauri dev`.
 */
export const BUILT_AT: string | null =
  (import.meta.env.VITE_BUILT_AT as string | undefined) || null;

export type ChangeKind = "feature" | "improvement" | "fix";

export type ChangelogEntry = {
  id: number;
  title: string;
  body: string;
  kind: ChangeKind;
  weight: number;
  shipped_at: string;
  /** How many more there were beyond the ones returned. */
  overflow: number;
};

export async function getChangelog(): Promise<ChangelogEntry[]> {
  const { data, error } = await supabase.rpc("get_changelog", {
    max_results: 20,
    built_at: BUILT_AT,
  });
  if (error || !data) return [];
  return data as ChangelogEntry[];
}

/** Moves the marker to this build's time, so newer entries still wait. */
export async function markChangelogSeen() {
  return supabase.rpc("mark_changelog_seen", { built_at: BUILT_AT });
}

export type UpcomingChanges = {
  /** A few headlines, biggest first. */
  titles: string[];
  /** How many entries there are in all, including the ones not listed. */
  total: number;
};

/**
 * What a newer build has that this one doesn't — for the update card.
 *
 * Entries written after this copy was built, and (when the updater
 * says when the new release was published) no later than that, so the
 * card doesn't promise something that's still waiting for the build
 * after. Titles only: the card is a nudge, not the release notes.
 */
export async function getUpcomingChanges(
  releasedAt: string | null,
  howMany = 3,
): Promise<UpcomingChanges> {
  if (!BUILT_AT) return { titles: [], total: 0 };

  let query = supabase
    .from("changelog_entries")
    .select("title", { count: "exact" })
    .gt("shipped_at", BUILT_AT)
    .order("weight", { ascending: true })
    .order("shipped_at", { ascending: false })
    .limit(howMany);

  if (releasedAt && !Number.isNaN(Date.parse(releasedAt))) {
    query = query.lte("shipped_at", new Date(releasedAt).toISOString());
  }

  const { data, count, error } = await query;
  if (error || !data) return { titles: [], total: 0 };

  return {
    titles: (data as { title: string }[]).map((row) => row.title),
    total: count ?? data.length,
  };
}

/** What the little tag on each row says. */
export function kindLabel(kind: ChangeKind): string {
  switch (kind) {
    case "feature":
      return "New";
    case "improvement":
      return "Better";
    case "fix":
      return "Fixed";
  }
}

/**
 * "3 days ago", "last month".
 *
 * Coarse on purpose. The point of the line is roughly how long ago,
 * not a timestamp somebody is meant to read.
 */
export function shippedAgo(iso: string): string {
  const days = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 86_400_000,
  );

  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30.44)} months ago`;
}
