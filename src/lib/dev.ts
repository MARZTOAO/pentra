import { supabase } from "./supabase";

/**
 * Developer mode.
 *
 * Every check here is a convenience for drawing the UI, not a
 * security boundary. The boundary is in the database: the tables
 * behind all of this have row level security on and no policies at
 * all, so they are unreachable through the API, and each dev_*
 * function checks am_i_developer() before it does anything. See
 * supabase/58_developer_mode.sql.
 *
 * That distinction matters because the anon key ships inside the
 * desktop build. Anybody can open the console and set a variable to
 * true. All that gets them is a panel full of failed requests.
 */

export type DevMetrics = {
  generated_at: string;
  growth: {
    accounts: number;
    new_today: number;
    new_7d: number;
    new_30d: number;
    active_24h: number;
    active_7d: number;
    active_30d: number;
  };
  engagement: {
    posts: number;
    posts_7d: number;
    sessions: number;
    sessions_7d: number;
    comments: number;
    comments_7d: number;
    likes: number;
    messages_7d: number;
    friendships: number;
    session_joins: number;
    sessions_past: number;
    sessions_host_only: number;
    avg_fill_pct: number | null;
  };
  retention: {
    returned_pct: number | null;
    month_old_still_active: number;
    never_returned: number;
    gone_quiet_14d: number;
    with_top_five: number;
  };
  referrals: {
    codes_live: number;
    signups: number;
    signups_7d: number;
    qualified: number;
    qualified_pct: number | null;
  };
};

export type DevEnvironment = {
  database: string;
  postgres: string;
  server_time: string;
  timezone: string;
  tables: number;
  functions: number;
  oldest_account: string | null;
};

export type DevFlag = {
  key: string;
  description: string | null;
  enabled_for_all: boolean;
  testers: string[];
  updated_at: string;
};

/** Never throws. A failure here just means no panel. */
export async function amIDeveloper(): Promise<boolean> {
  const { data, error } = await supabase.rpc("am_i_developer");
  if (error) return false;
  return data === true;
}

export async function getMetrics(): Promise<DevMetrics | null> {
  const { data, error } = await supabase.rpc("dev_metrics");
  if (error || !data) return null;
  return data as DevMetrics;
}

export async function getEnvironment(): Promise<DevEnvironment | null> {
  const { data, error } = await supabase.rpc("dev_environment");
  if (error || !data) return null;
  return data as DevEnvironment;
}

export async function getFlags(): Promise<DevFlag[]> {
  const { data, error } = await supabase.rpc("dev_flags");
  if (error || !data) return [];
  return data as DevFlag[];
}

export async function setFlag(
  key: string,
  description: string | null,
  forAll: boolean,
): Promise<string | null> {
  const { error } = await supabase.rpc("dev_set_flag", {
    flag_key: key,
    note: description,
    for_all: forAll,
  });
  return error ? error.message : null;
}

export async function dropFlag(key: string): Promise<string | null> {
  const { error } = await supabase.rpc("dev_drop_flag", { flag_key: key });
  return error ? error.message : null;
}

/**
 * @returns a short status to show, or an error message. The database
 *   answers 'added', 'no such player' or 'no such flag' rather than
 *   raising, because a typo in a username is an ordinary thing to do
 *   and deserves a sentence rather than a stack trace.
 */
export async function addTester(
  key: string,
  username: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("dev_add_tester", {
    flag_key: key,
    who: username,
  });
  if (error) return error.message;
  return (data as string) ?? "failed";
}

export async function removeTester(
  key: string,
  username: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("dev_remove_tester", {
    flag_key: key,
    who: username,
  });
  if (error) return error.message;
  return (data as string) ?? "failed";
}

/**
 * What this build actually is.
 *
 * Vite replaces these at build time. They come from the environment
 * Vercel already sets on every deployment, so a preview build and
 * production are told apart without any configuration — see
 * vite.config.ts. In local dev they are simply absent, which is
 * itself the answer.
 */
export function buildInfo() {
  return {
    commit: (import.meta.env.VITE_COMMIT_SHA as string) || "local",
    branch: (import.meta.env.VITE_BRANCH as string) || "local",
    env: (import.meta.env.VITE_DEPLOY_ENV as string) || "development",
    builtAt: (import.meta.env.VITE_BUILT_AT as string) || "just now",
    mode: String(import.meta.env.MODE ?? "unknown"),
  };
}

/* ------------------------------------------------------------------
 *  Moderation
 *
 *  A person reaches this queue once three DIFFERENT people have
 *  reported them — or immediately, from one report, if it alleges
 *  threats, sexual content, or a minor being targeted. See
 *  supabase/61_moderation.sql.
 * ---------------------------------------------------------------- */

export type ReportedUser = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  reports: number;
  reporters: number;
  reasons: string[];
  details: string[];
  first_at: string;
  last_at: string;
  /** Here for what was alleged, not how many alleged it. */
  severe: boolean;
  banned_until: string | null;
  warn_count: number;
  last_action: string | null;
  last_action_at: string | null;
};

export type ReportBacklog = {
  open_reports: number;
  people: number;
  below_threshold: number;
};

export async function getReportQueue(): Promise<ReportedUser[]> {
  const { data, error } = await supabase.rpc("dev_report_queue");
  if (error || !data) return [];
  return data as ReportedUser[];
}

export async function getReportBacklog(): Promise<ReportBacklog | null> {
  const { data, error } = await supabase.rpc("dev_report_backlog");
  if (error || !data) return null;
  return data as ReportBacklog;
}

export async function warnUser(username: string, note: string) {
  const { data, error } = await supabase.rpc("dev_warn_user", {
    who: username,
    note,
  });
  if (error) return error.message;
  return (data as string) ?? "failed";
}

/** @param days null for indefinite. */
export async function banUser(
  username: string,
  reason: string,
  days: number | null,
) {
  const { data, error } = await supabase.rpc("dev_ban_user", {
    who: username,
    reason,
    days,
  });
  if (error) return error.message;
  return (data as string) ?? "failed";
}

export async function unbanUser(username: string) {
  const { data, error } = await supabase.rpc("dev_unban_user", {
    who: username,
  });
  if (error) return error.message;
  return (data as string) ?? "failed";
}

export async function dismissReports(username: string, note: string | null) {
  const { data, error } = await supabase.rpc("dev_dismiss_reports", {
    who: username,
    note,
  });
  if (error) return error.message;
  return (data as string) ?? "failed";
}
