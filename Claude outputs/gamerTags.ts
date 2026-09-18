import { supabase } from "./supabase";

export type GamerTag = {
  network: string;
  handle: string;
};

/** The networks people can add. Keys are stored; labels are shown. */
export const NETWORKS = [
  {
    key: "steam",
    label: "Steam",
    placeholder: "Profile URL or Steam ID",
  },
  {
    key: "psn",
    label: "PlayStation",
    placeholder: "PSN Online ID",
  },
  {
    key: "xbox",
    label: "Xbox",
    placeholder: "Gamertag",
  },
  {
    key: "nintendo",
    label: "Nintendo Switch",
    placeholder: "SW-0000-0000-0000",
  },
  {
    key: "discord",
    label: "Discord",
    placeholder: "username",
  },
  {
    key: "epic",
    label: "Epic Games",
    placeholder: "Display name",
  },
  {
    key: "battlenet",
    label: "Battle.net",
    placeholder: "BattleTag#1234",
  },
  {
    key: "riot",
    label: "Riot",
    placeholder: "Name#TAG",
  },
] as const;

export function networkLabel(key: string): string {
  return NETWORKS.find((n) => n.key === key)?.label ?? key;
}

/**
 * Returns someone's gamer tags.
 *
 * If you aren't friends with them, this comes back empty - not because
 * the app filters it, but because the database refuses to return the
 * rows. See supabase/07_gamer_tags.sql.
 */
export async function getGamerTags(userId: string): Promise<GamerTag[]> {
  const { data, error } = await supabase
    .from("gamer_tags")
    .select("network, handle")
    .eq("user_id", userId);

  if (error || !data) return [];
  return data as GamerTag[];
}

export async function saveGamerTags(tags: GamerTag[]) {
  return supabase.rpc("set_gamer_tags", {
    items: tags
      .filter((t) => t.handle.trim().length > 0)
      .map((t) => ({ network: t.network, handle: t.handle.trim() })),
  });
}
