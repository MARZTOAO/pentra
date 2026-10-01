import { supabase } from "./supabase";
import { prepareMedia, MediaError, mb } from "./media";
import type { Post } from "./feed";

/**
 * Ads in the feed — supabase/85_feed_ads.sql.
 *
 * The database says which ads are live; this file decides where they
 * go: every AD_EVERY-th item in the feed is an ad (four posts, an ad,
 * four posts, an ad …), and the ad slots take turns through the live
 * ads in order, so with three ads running each gets a third of the
 * slots. The starting ad is picked at random each time the feed opens,
 * so the first slot isn't always the same ad — over many visits every
 * ad is shown equally often.
 *
 * No live ads, no ad slots: the feed is just posts.
 */

/** An ad is every 5th item in the feed. */
export const AD_EVERY = 5;

export type Ad = {
  id: number;
  sponsor: string;
  body: string | null;
  media_kind: "image" | "video";
  media_path: string;
  width: number;
  height: number;
  link_url: string;
};

export type FeedItem =
  | { kind: "post"; post: Post }
  | { kind: "ad"; ad: Ad; slot: number };

/** Where an ad's picture or video lives (public bucket). */
export function adMediaUrl(path: string): string {
  return supabase.storage.from("ads").getPublicUrl(path).data.publicUrl;
}

/** Never throws: no ads is a perfectly good answer. */
export async function getLiveAds(): Promise<Ad[]> {
  const { data, error } = await supabase.rpc("get_live_ads");
  if (error || !data) return [];
  return data as Ad[];
}

/** Where the rotation starts for this visit to the feed. */
export function adRotationStart(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/**
 * The feed with ads slotted in. Slot k gets ads[(start + k) % n], so
 * consecutive slots step through every live ad before repeating.
 */
export function withAds(posts: Post[], ads: Ad[], start: number): FeedItem[] {
  const items: FeedItem[] = [];
  let slot = 0;
  for (const post of posts) {
    items.push({ kind: "post", post });
    if (ads.length > 0 && (items.length + 1) % AD_EVERY === 0) {
      items.push({ kind: "ad", ad: ads[(start + slot) % ads.length], slot });
      slot += 1;
    }
  }
  return items;
}

/**
 * Adds one to the ad's view or click count for today. Fire and forget —
 * a count that didn't land is not worth bothering anybody about.
 * Nothing about who is sent or stored.
 */
export function recordAdEvent(id: number, what: "view" | "click") {
  void supabase.rpc("record_ad_event", { ad: id, what });
}

/* ------------------------------------------------------------------ */
/*  The ads manager (DevPanel → Ads). Developers only — the database   */
/*  refuses everyone else.                                             */
/* ------------------------------------------------------------------ */

export type AdUnit = "days" | "weeks" | "months" | "years";
export const AD_UNITS: AdUnit[] = ["days", "weeks", "months", "years"];

export type DevAd = Ad & {
  starts_at: string;
  ends_at: string;
  created_at: string;
  live: boolean;
  views: number;
  clicks: number;
  views_today: number;
  clicks_today: number;
};

export async function listAds(): Promise<DevAd[] | null> {
  const { data, error } = await supabase.rpc("dev_ads");
  if (error || !data) return null;
  return data as DevAd[];
}

/** Videos go up as they are; this is Supabase's per-file ceiling. */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export type PreparedAd = {
  kind: "image" | "video";
  blob: Blob;
  extension: string;
  contentType: string;
  width: number;
  height: number;
  previewUrl: string;
};

/**
 * A picked file, ready to upload. Pictures (and GIFs) go through the
 * same shrinking as post pictures — 1600px, WebP — so an ad doesn't
 * cost every player a 10MB download. Videos are uploaded untouched;
 * MP4 or WebM, up to 50MB.
 *
 * @throws MediaError with a sentence worth showing.
 */
export async function prepareAdMedia(file: File): Promise<PreparedAd> {
  if (file.type === "video/mp4" || file.type === "video/webm") {
    if (file.size > MAX_VIDEO_BYTES) {
      throw new MediaError(`That video is ${mb(file.size)} — 50MB is the most an ad can be.`);
    }
    const previewUrl = URL.createObjectURL(file);
    const { width, height } = await videoSize(previewUrl);
    return {
      kind: "video",
      blob: file,
      extension: file.type === "video/mp4" ? "mp4" : "webm",
      contentType: file.type,
      width,
      height,
      previewUrl,
    };
  }

  if (file.type.startsWith("video/")) {
    throw new MediaError("Videos need to be MP4 or WebM.");
  }

  const p = await prepareMedia(file); // throws "That's not an image." for anything else
  return {
    kind: p.kind,
    blob: p.blob,
    extension: p.extension,
    contentType: p.blob.type || contentTypeFor(p.extension),
    width: p.width,
    height: p.height,
    previewUrl: p.previewUrl,
  };
}

function videoSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        resolve({ width: v.videoWidth, height: v.videoHeight });
      } else {
        reject(new MediaError("Couldn't read that video."));
      }
    };
    v.onerror = () => reject(new MediaError("Couldn't read that video."));
    v.src = url;
  });
}

function contentTypeFor(ext: string): string {
  switch (ext) {
    case "webm": return "video/webm";
    case "mp4": return "video/mp4";
    case "png": return "image/png";
    case "gif": return "image/gif";
    case "avif": return "image/avif";
    case "webp": return "image/webp";
    default: return "image/jpeg";
  }
}

export type NewAd = {
  sponsor: string;
  body: string;
  linkUrl: string;
  runFor: number;
  unit: AdUnit;
  media: PreparedAd;
};

/**
 * Uploads the file, then creates the ad. If the database turns the ad
 * down, the file is removed again so nothing is left orphaned.
 *
 * @returns null when it worked, or a sentence saying what went wrong.
 */
export async function createAd(ad: NewAd): Promise<string | null> {
  const path = `${crypto.randomUUID()}.${ad.media.extension}`;

  const up = await supabase.storage.from("ads").upload(path, ad.media.blob, {
    contentType: ad.media.contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (up.error) return `Upload failed: ${up.error.message}`;

  const { data, error } = await supabase.rpc("dev_ad_create", {
    sponsor: ad.sponsor,
    body: ad.body,
    media_kind: ad.media.kind,
    media_path: path,
    width: ad.media.width,
    height: ad.media.height,
    link_url: ad.linkUrl,
    run_for: ad.runFor,
    unit: ad.unit,
  });

  const ok = !error && typeof data === "string" && /^\d+$/.test(data);
  if (!ok) {
    await supabase.storage.from("ads").remove([path]);
    return error ? error.message : (data as string) || "Couldn't create the ad.";
  }
  return null;
}

/** Stops an ad now. Its numbers stay. */
export async function endAd(id: number): Promise<string | null> {
  const { error } = await supabase.rpc("dev_ad_end", { ad: id });
  return error ? error.message : null;
}

/** Removes an ad, its numbers and its file. */
export async function deleteAd(id: number): Promise<string | null> {
  const { data, error } = await supabase.rpc("dev_ad_delete", { ad: id });
  if (error) return error.message;
  if (typeof data === "string" && data) {
    await supabase.storage.from("ads").remove([data]);
  }
  return null;
}

/** "example.com" from a link, for the card and the manager. */
export function linkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
