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

export async function fileReport(args: {
  userId?: string | null;
  postId?: number | null;
  reason: string;
  detail?: string;
}) {
  return supabase.rpc("file_report", {
    target_user_id: args.userId ?? null,
    target_post_id: args.postId ?? null,
    reason: args.reason,
    detail: args.detail ?? null,
  });
}
