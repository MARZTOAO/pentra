import { supabase } from "./supabase";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  /** Fixed list. This is what matching uses. */
  region: string | null;
  /** Display only - see supabase/05_location.sql. */
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  timezone: string | null;
  platforms: string[];
  availability: string[];
  last_seen_at: string | null;
  created_at: string | null;
};

const COLUMNS =
  "id, username, display_name, avatar_url, bio, region, location_city, location_state, location_country, timezone, platforms, availability, last_seen_at, created_at";

export async function getProfile(userId: string) {
  return supabase.from("profiles").select(COLUMNS).eq("id", userId).single();
}

export async function getProfileByUsername(username: string) {
  return supabase
    .from("profiles")
    .select(COLUMNS)
    .ilike("username", username)
    .single();
}

export type ProfileUpdate = Partial<
  Pick<
    Profile,
    | "display_name"
    | "bio"
    | "region"
    | "location_city"
    | "location_state"
    | "location_country"
    | "timezone"
    | "platforms"
    | "availability"
    | "avatar_url"
  >
>;

export async function updateProfile(userId: string, patch: ProfileUpdate) {
  return supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select(COLUMNS)
    .single();
}

/**
 * Uploads an avatar and returns its public URL.
 *
 * Files are stored under a folder named after the user's id, which is what
 * the storage security rules key off - you can only write inside your own
 * folder. `upsert` means re-uploading replaces the old file rather than
 * piling up copies.
 */
export async function uploadAvatar(userId: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${userId}/avatar.${extension}`;

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) return { url: null, error };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);

  // Cache-busting suffix: the URL never changes when you replace the file,
  // so without this the browser keeps showing the old picture.
  return { url: `${data.publicUrl}?v=${Date.now()}`, error: null };
}
