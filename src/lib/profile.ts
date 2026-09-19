import { supabase } from "./supabase";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  /** A premade avatar, as "shape.colour". Beaten by an upload. */
  avatar_preset: string | null;
  bio: string | null;
  /** Fixed list. This is what matching uses. */
  region: string | null;
  /** Display only - see supabase/05_location.sql. */
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  timezone: string | null;
  platforms: string[];
  /** The one they actually play on most. Stronger signal than `platforms`. */
  primary_platform: string | null;
  /** Key of a built-in gradient - see lib/backgrounds.ts. */
  background: string | null;
  /** An uploaded banner image. Wins over `background` when both are set. */
  banner_url: string | null;
  /** Which colour palette this person uses. Personal, not public. */
  app_theme: string | null;
  /** 'everyone' | 'friends' | 'nobody' — who can start a conversation. */
  message_privacy: "everyone" | "friends" | "nobody";
  /**
   * Ten characters, like A1B2C3D4E5, unique across every account that
   * has ever existed. Issued by the database, permanent, and rejected
   * if written from here - see supabase/20_friend_codes.sql.
   *
   * Only fetched for your own profile. Someone else's comes back null,
   * because the app has no reason to hand their code around.
   */
  friend_code: string | null;
  availability: string[];
  last_seen_at: string | null;
  created_at: string | null;
  /** 'free' or 'plus'. Read-only from the app - only billing can change it. */
  tier: "free" | "plus";
  tier_expires_at: string | null;
};

/** What anyone may see when they open a profile. */
const PUBLIC_COLUMNS =
  "id, username, display_name, avatar_url, avatar_preset, bio, region, location_city, location_state, location_country, timezone, platforms, primary_platform, background, banner_url, app_theme, message_privacy, availability, last_seen_at, created_at, tier, tier_expires_at";

/** Your own row, which also carries your friend code. */
const COLUMNS = `${PUBLIC_COLUMNS}, friend_code`;

export async function getProfile(userId: string) {
  return supabase.from("profiles").select(COLUMNS).eq("id", userId).single();
}

export async function getProfileByUsername(username: string) {
  return supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
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
    | "primary_platform"
    | "background"
    | "banner_url"
    | "app_theme"
    | "message_privacy"
    | "availability"
    | "avatar_url"
    | "avatar_preset"
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
 * Whether this account has yet to see the welcome.
 *
 * Kept on the profile row rather than in the browser, so signing in on
 * a second device — or reinstalling — doesn't show the tour again.
 * See supabase/31_welcome.sql.
 */
export async function needsWelcome(): Promise<boolean> {
  const { data, error } = await supabase.rpc("needs_welcome");
  // On error, say no. A welcome that fails to appear is a small loss; one
  // that appears to an established player every time the network hiccups
  // is an irritation they can't get rid of.
  if (error) return false;
  return Boolean(data);
}

/** Records that they've seen it. Keeps the first timestamp on a repeat call. */
export async function markWelcomed() {
  return supabase.rpc("mark_welcomed");
}

export async function uploadBanner(userId: string, file: File) {
  return uploadTo("banners", userId, "banner", file);
}

/**
 * Avatars arrive already resized and re-encoded by prepareAvatar(), so
 * this takes a blob and an explicit extension rather than a File — the
 * processed blob has no filename to read one from.
 */
export async function uploadAvatar(
  userId: string,
  blob: Blob,
  extension: string,
) {
  const result = await uploadTo("avatars", userId, "avatar", blob, extension);

  // `upsert` only replaces the identical path, so someone who uploaded a
  // PNG before and a WebP now would leave avatar.png sitting in the
  // bucket forever — unreferenced, but still stored and still public.
  // Best effort: a failure here doesn't affect the avatar they just set.
  if (!result.error) {
    const stale = ["png", "jpg", "jpeg", "webp", "gif"]
      .filter((e) => e !== extension)
      .map((e) => `${userId}/avatar.${e}`);

    await supabase.storage.from("avatars").remove(stale);
  }

  return result;
}

/**
 * Shared upload path for avatars and banners.
 *
 * Files go in a folder named after the user's id, which is what the
 * storage rules key off - you can only write inside your own folder.
 * `upsert` replaces the old file rather than piling up copies.
 */
async function uploadTo(
  bucket: string,
  userId: string,
  name: string,
  file: Blob,
  forcedExtension?: string,
) {
  const extension =
    forcedExtension ??
    (file instanceof File ? file.name.split(".").pop()?.toLowerCase() : null) ??
    "png";
  const path = `${userId}/${name}.${extension}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) return { url: null, error };

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  // Cache-busting suffix: the URL never changes when you replace the file,
  // so without this the browser keeps showing the old picture.
  return { url: `${data.publicUrl}?v=${Date.now()}`, error: null };
}

/**
 * Whether this profile currently has paid features.
 *
 * Checks expiry as well as the tier itself - a row can say 'plus' while
 * the paid period has already lapsed. Mirrors the has_plus() function in
 * supabase/10_tiers.sql; the database one is what actually enforces
 * anything, this is just for showing and hiding interface.
 */
export function hasPlus(p: Pick<Profile, "tier" | "tier_expires_at">) {
  if (p.tier !== "plus") return false;
  if (!p.tier_expires_at) return true;
  return new Date(p.tier_expires_at) > new Date();
}
