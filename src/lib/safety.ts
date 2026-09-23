import { supabase } from "./supabase";

export type BlockedUser = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  created_at: string;
};

export async function blockUser(otherId: string) {
  return supabase.rpc("block_user", { other: otherId });
}

export async function unblockUser(otherId: string) {
  return supabase.rpc("unblock_user", { other: otherId });
}

export async function getBlocked(): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc("get_blocked");
  if (error || !data) return [];
  return data as BlockedUser[];
}

export const REPORT_REASONS = [
  { key: "harassment", label: "Harassment or bullying" },
  { key: "spam", label: "Spam or scams" },
  { key: "hate", label: "Hate speech" },
  { key: "sexual", label: "Sexual content" },
  { key: "threats", label: "Threats or violence" },
  { key: "impersonation", label: "Impersonation" },
  { key: "underage", label: "Appears to be under 13" },
  { key: "other", label: "Something else" },
] as const;

/**
 * File a report about a person, a post, or a single message.
 *
 * Reporting a MESSAGE is the one that carries evidence: the database
 * copies what was said into the report itself, so the moderation queue
 * shows the text rather than just "someone complained". The snapshot is
 * taken server-side on purpose — a body sent from here is a body the
 * reporter could have typed themselves.
 *
 * `userId` is not needed alongside `messageId`; the database sets the
 * subject to whoever sent the message, so it groups with anything else
 * already filed about that person.
 */
export async function fileReport(args: {
  userId?: string | null;
  postId?: number | null;
  messageId?: number | null;
  reason: string;
  detail?: string;
}) {
  return supabase.rpc("file_report", {
    target_user_id: args.userId ?? null,
    target_post_id: args.postId ?? null,
    target_message_id: args.messageId ?? null,
    reason: args.reason,
    detail: args.detail ?? null,
  });
}
