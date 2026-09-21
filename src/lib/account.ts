import { supabase } from "./supabase";

/**
 * Leaving.
 *
 * The delete happens in the database, because removing an auth user
 * needs privileges the browser must never hold — see
 * supabase/53_delete_account.sql. The function there takes no user
 * id: it can only ever delete whoever called it.
 */

export type DeleteResult =
  | "deleted"
  | "name_mismatch"
  | "signed_out"
  | "failed";

/**
 * @param confirmUsername what they typed. Has to match their own
 *   username, which is not security — they obviously know it — but a
 *   guard so this can never be reached by accident.
 */
export async function deleteMyAccount(
  confirmUsername: string,
): Promise<DeleteResult> {
  const { data, error } = await supabase.rpc("delete_my_account", {
    confirm_username: confirmUsername,
  });

  if (error) return "failed";
  return (data as DeleteResult) ?? "failed";
}
