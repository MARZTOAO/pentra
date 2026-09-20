import { supabase } from "./supabase";

/**
 * "While you were gone."
 *
 * The database decides whether there is anything to say — it returns
 * no rows when there isn't, and no rows while the welcome dialog is
 * still pending, so two modals can never stack on a first run. See
 * supabase/49_changelog.sql.
 */

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
  });
  if (error || !data) return [];
  return data as ChangelogEntry[];
}

export async function markChangelogSeen() {
  return supabase.rpc("mark_changelog_seen");
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
