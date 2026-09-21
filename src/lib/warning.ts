import { supabase } from "./supabase";

/**
 * A warning, from the person's own side.
 *
 * Deliberately not a notification. A warning that sits in the bell
 * next to "someone liked your post" is a warning nobody reads, and
 * the whole point of warning rather than banning is that the person
 * gets a real chance to stop. So it's a banner they have to
 * acknowledge, and the acknowledgement is recorded — which also
 * answers "did they actually see it" the next time they're reported.
 *
 * See supabase/61_moderation.sql.
 */

export type Warning = {
  id: number;
  note: string | null;
  created_at: string;
};

export async function myWarning(): Promise<Warning | null> {
  const { data, error } = await supabase.rpc("my_warning");
  if (error || !data || (data as Warning[]).length === 0) return null;
  return (data as Warning[])[0];
}

export async function acknowledgeWarning(id: number) {
  return supabase.rpc("acknowledge_warning", { which: id });
}
