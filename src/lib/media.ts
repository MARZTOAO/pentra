import { supabase } from "./supabase";

/**
 * Turning what someone picked off their desktop into something a feed
 * can carry.
 *
 * A photo straight from a phone is 4000 pixels wide and four megabytes.
 * Shown in a feed column it occupies about 600 pixels, so all but a
 * fraction of that file is detail nobody will ever see — but everybody
 * pays to download it. The work here happens on the poster's machine
 * before anything is uploaded: resize to what will actually be
 * displayed, re-encode, keep whichever result is smaller.
 *
 * Nothing is uploaded at original size, and nothing is uploaded that
 * hasn't been checked for being an image in the first place.
 */

/** Longest edge we keep. Twice the widest the feed ever draws, so it
 *  still looks sharp on a high-density screen and when opened full. */
const MAX_EDGE = 1600;

/** GIFs become video, and the feed column is narrow. 800 is generous. */
const MAX_GIF_EDGE = 800;

/** WebP quality for photographs. 0.82 is the point where artefacts
 *  stop being visible but the file is still a third of a JPEG. */
const PHOTO_QUALITY = 0.82;

/** Screenshots get encoded losslessly instead - see pickQuality(). If
 *  that turns out enormous, this is the fallback. */
const GRAPHIC_QUALITY = 0.92;

/** Above this, a "graphic" is too big to be worth storing losslessly. */
const LOSSLESS_CEILING = 600 * 1024;

/** Below this share of distinct colours, an image is flat-shaded -
 *  a screenshot, a meme, UI - rather than a photograph. Measured:
 *  a game screenshot scores 0.0008, a photo 0.27. */
const GRAPHIC_THRESHOLD = 0.05;

/** A GIF longer than this gets trimmed. Past ~15s it isn't a reaction
 *  any more, it's a video, and it should be posted as one. */
const MAX_GIF_SECONDS = 15;

/** Hard ceiling on what we'll even open. */
const MAX_INPUT_BYTES = 50 * 1024 * 1024;

/** What we'll accept if conversion isn't available and we have to
 *  upload a GIF untouched. */
const MAX_RAW_GIF_BYTES = 8 * 1024 * 1024;

export const MAX_ATTACHMENTS = 4;

export const ACCEPTED_TYPES =
  "image/jpeg,image/png,image/webp,image/gif,image/avif";

export type PreparedMedia = {
  kind: "image" | "video";
  blob: Blob;
  width: number;
  height: number;
  extension: string;
  /** For showing a thumbnail in the composer before upload. */
  previewUrl: string;
  /** What it weighed when they picked it, for the "saved 82%" line. */
  originalBytes: number;
};

export type UploadedMedia = {
  kind: "image" | "video";
  url: string;
  path: string;
  width: number;
  height: number;
  alt?: string | null;
};

export class MediaError extends Error {}

/**
 * The one entry point. Hands back something ready to upload, or
 * throws with a sentence worth showing the person.
 */
export async function prepareMedia(file: File): Promise<PreparedMedia> {
  if (!file.type.startsWith("image/")) {
    throw new MediaError("That's not an image.");
  }

  if (file.size > MAX_INPUT_BYTES) {
    throw new MediaError(
      `${file.name} is ${mb(file.size)} — 50MB is the most I can open.`,
    );
  }

  if (file.type === "image/gif") {
    return prepareGif(file);
  }

  return prepareStill(file);
}


// ------------------------------------------------------------
//  Photographs
// ------------------------------------------------------------
async function prepareStill(file: File): Promise<PreparedMedia> {
  const bitmap = await decode(file);

  const { width, height } = fit(bitmap.width, bitmap.height, MAX_EDGE);
  const canvas = draw(bitmap, width, height);
  bitmap.close();

  // A screenshot and a photograph want opposite treatment, and getting
  // this wrong is what makes small text in a scoreboard go mushy. See
  // looksLikeGraphic() below.
  let blob = await encodeWell(canvas);
  let extension = "webp";

  if (!blob) {
    // No WebP at all: JPEG is the only universal lossy format left.
    blob = await encode(canvas, "image/jpeg", PHOTO_QUALITY);
    extension = "jpg";
  }

  if (!blob) {
    throw new MediaError("Couldn't read that image.");
  }

  // Re-encoding usually shrinks things dramatically, but not always —
  // a small, already-optimised PNG of flat colour can come out bigger.
  // When that happens, keep what they gave us.
  const untouched = width === bitmap.width && height === bitmap.height;
  if (untouched && blob.size >= file.size) {
    return {
      kind: "image",
      blob: file,
      width,
      height,
      extension: extensionOf(file.type),
      previewUrl: URL.createObjectURL(file),
      originalBytes: file.size,
    };
  }

  return {
    kind: "image",
    blob,
    width,
    height,
    extension,
    previewUrl: URL.createObjectURL(blob),
    originalBytes: file.size,
  };
}


// ------------------------------------------------------------
//  GIFs
//
//  A GIF is a stack of full frames with no compression between them,
//  which is why a three-second clip can run to eight megabytes. Every
//  large site quietly converts them to video on upload for exactly
//  this reason — the result looks identical and is an order of
//  magnitude smaller.
//
//  Done here by decoding the frames, replaying them onto a canvas at
//  their original timing, and recording that canvas. The replay is
//  real-time, so a five-second GIF takes about five seconds; the
//  composer shows progress while it runs.
//
//  Where the browser can't do this, the GIF is uploaded as-is instead.
// ------------------------------------------------------------
async function prepareGif(file: File): Promise<PreparedMedia> {
  if (canConvertGif()) {
    try {
      return await gifToVideo(file);
    } catch {
      // Conversion is an optimisation, never a reason to lose the post.
      // Fall through and upload the original.
    }
  }

  if (file.size > MAX_RAW_GIF_BYTES) {
    throw new MediaError(
      `That GIF is ${mb(file.size)}. This machine can't convert GIFs, ` +
        `so it would have to upload whole — 8MB is the limit for that.`,
    );
  }

  const bitmap = await decode(file);
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close();

  return {
    kind: "image",
    blob: file,
    width,
    height,
    extension: "gif",
    previewUrl: URL.createObjectURL(file),
    originalBytes: file.size,
  };
}

function canConvertGif(): boolean {
  return (
    typeof window !== "undefined" &&
    "ImageDecoder" in window &&
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported(videoMimeType())
  );
}

function videoMimeType(): string {
  // VP9 is markedly better per byte; VP8 is the fallback.
  if (
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
  ) {
    return "video/webm;codecs=vp9";
  }
  return "video/webm;codecs=vp8";
}

type AnyDecoder = {
  completed: Promise<void>;
  tracks: { ready: Promise<void>; selectedTrack?: { frameCount: number } };
  decode(o: { frameIndex: number }): Promise<{
    image: CanvasImageSource & { duration?: number | null; close(): void };
  }>;
  close(): void;
};

async function gifToVideo(file: File): Promise<PreparedMedia> {
  const Decoder = (window as unknown as { ImageDecoder: new (o: object) => AnyDecoder })
    .ImageDecoder;

  const decoder = new Decoder({
    data: await file.arrayBuffer(),
    type: "image/gif",
  });

  await decoder.tracks.ready;
  await decoder.completed;

  const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 0;
  if (frameCount < 1) throw new MediaError("Couldn't read that GIF.");

  // First frame tells us the size.
  const first = await decoder.decode({ frameIndex: 0 });
  const source = first.image;
  const natural = {
    width: (source as unknown as { displayWidth?: number }).displayWidth ?? 0,
    height: (source as unknown as { displayHeight?: number }).displayHeight ?? 0,
  };

  const { width, height } = fit(
    natural.width || MAX_GIF_EDGE,
    natural.height || MAX_GIF_EDGE,
    MAX_GIF_EDGE,
  );

  const canvas = document.createElement("canvas");
  // Even dimensions: video codecs work in 2x2 blocks and some encoders
  // refuse an odd number of pixels outright.
  canvas.width = width - (width % 2);
  canvas.height = height - (height % 2);

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new MediaError("Couldn't read that GIF.");

  // GIFs are often drawn on transparency; video has none, so anything
  // see-through would come out as garbage without a backdrop.
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close();

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & {
    requestFrame?: () => void;
  };

  const recorder = new MediaRecorder(stream, {
    mimeType: videoMimeType(),
    videoBitsPerSecond: bitrateFor(canvas.width, canvas.height),
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const finished = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start();
  track.requestFrame?.();

  let elapsed = 0;

  for (let i = 1; i < frameCount; i++) {
    const { image } = await decoder.decode({ frameIndex: i });

    // Durations are microseconds. A GIF with a nonsense or missing
    // delay gets the 100ms most viewers assume.
    const ms = Math.max(20, Math.round((image.duration ?? 100_000) / 1000));

    await wait(ms);

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    track.requestFrame?.();

    elapsed += ms;
    if (elapsed > MAX_GIF_SECONDS * 1000) break;
  }

  // Let the last frame have some screen time of its own, or it gets
  // dropped when the recorder stops.
  await wait(120);

  recorder.stop();
  await finished;
  track.stop();
  decoder.close();

  const blob = new Blob(chunks, { type: "video/webm" });

  if (blob.size === 0) throw new MediaError("Couldn't convert that GIF.");

  return {
    kind: "video",
    blob,
    width: canvas.width,
    height: canvas.height,
    extension: "webm",
    previewUrl: URL.createObjectURL(blob),
    originalBytes: file.size,
  };
}

/**
 * Enough bits to keep a looping clip clean without wasting any.
 *
 * Scaled to pixel count rather than fixed, so a small reaction GIF
 * doesn't get the same budget as a full-width one.
 */
function bitrateFor(width: number, height: number): number {
  const pixels = width * height;
  return Math.min(4_000_000, Math.max(600_000, Math.round(pixels * 4)));
}


// ------------------------------------------------------------
//  Upload
// ------------------------------------------------------------

/**
 * Puts one prepared file in the bucket and returns what the post
 * needs to point at it.
 *
 * The filename is random rather than the original. Someone's holiday
 * photo shouldn't publish its filename to the internet, and two people
 * uploading screenshot.png shouldn't collide.
 */
export async function uploadMedia(
  userId: string,
  item: PreparedMedia,
): Promise<UploadedMedia> {
  const path = `${userId}/${crypto.randomUUID()}.${item.extension}`;

  const { error } = await supabase.storage
    .from("post-media")
    .upload(path, item.blob, {
      contentType: item.blob.type || mimeFor(item.extension),
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) throw new MediaError(error.message);

  const { data } = supabase.storage.from("post-media").getPublicUrl(path);

  return {
    kind: item.kind,
    url: data.publicUrl,
    path,
    width: item.width,
    height: item.height,
  };
}

/** Best-effort tidy-up after a post is deleted. */
export async function removeMedia(paths: string[]) {
  if (paths.length === 0) return;
  await supabase.storage.from("post-media").remove(paths);
}


// ------------------------------------------------------------
//  Small shared pieces
// ------------------------------------------------------------

async function decode(file: File): Promise<ImageBitmap> {
  try {
    // imageOrientation matters: phone photos carry a rotation flag that
    // a plain canvas draw ignores, which is how an upright picture
    // arrives on its side.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new MediaError("Couldn't read that image — it may be damaged.");
  }
}

function fit(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };

  const scale = maxEdge / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function draw(bitmap: ImageBitmap, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new MediaError("Couldn't process that image.");

  // Downscaling without this leaves stair-stepped edges on anything
  // with fine detail — text in a screenshot, most obviously.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);

  return canvas;
}

/**
 * Encodes at whatever quality suits what's actually in the picture.
 *
 * A photograph at quality 0.82 is indistinguishable from the original
 * and a fraction of the size. The same setting on a screenshot smears
 * every letter of small text, because lossy compression spends its
 * budget on smooth gradients and flat panels of UI have none — all the
 * information is in the hard edges it throws away.
 *
 * Screenshots compress extremely well losslessly, for the same reason:
 * measured on a 1600x900 scoreboard, lossless WebP came to 29KB against
 * 18KB for quality 0.82. Eleven kilobytes to keep text crisp is not a
 * trade worth thinking about.
 */
async function encodeWell(canvas: HTMLCanvasElement): Promise<Blob | null> {
  if (!looksLikeGraphic(canvas)) {
    return encode(canvas, "image/webp", PHOTO_QUALITY);
  }

  // Quality 1.0 is what asks Chromium's WebP encoder for lossless.
  const lossless = await encode(canvas, "image/webp", 1);
  if (lossless && lossless.size <= LOSSLESS_CEILING) return lossless;

  // A big illustration or a gradient-heavy poster can still be huge
  // losslessly. Back off, but stay well above photo quality.
  const high = await encode(canvas, "image/webp", GRAPHIC_QUALITY);

  if (!high) return lossless;
  if (!lossless) return high;

  return lossless.size <= high.size ? lossless : high;
}

/**
 * Flat-shaded, or photographic?
 *
 * Counts roughly how many distinct colours appear in a sample of the
 * image. Photographs are all gradient and sensor noise, so nearly
 * every sampled pixel is its own colour; interfaces reuse the same
 * handful over and over. The gap between the two is enormous, which is
 * what makes a single threshold safe here.
 */
function looksLikeGraphic(canvas: HTMLCanvasElement): boolean {
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;

    const { width, height } = canvas;
    // Sample about 40,000 pixels however large the image is, so this
    // costs the same on a 12-megapixel photo as on a thumbnail.
    const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 40_000)));

    const { data } = context.getImageData(0, 0, width, height);
    const seen = new Set<number>();
    let sampled = 0;

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        // Five bits a channel: close-enough colours count as one, so
        // mild noise doesn't masquerade as detail.
        seen.add(
          ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3),
        );
        sampled++;
      }
    }

    if (sampled === 0) return false;
    return seen.size / sampled < GRAPHIC_THRESHOLD;
  } catch {
    // Reading pixels back can fail. Photograph settings are the safer
    // guess, since they're never enormous.
    return false;
  }
}

function encode(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob && blob.type === type ? blob : null),
      type,
      quality,
    );
  });
}

function extensionOf(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/avif") return "avif";
  return "jpg";
}

function mimeFor(extension: string): string {
  if (extension === "webm") return "video/webm";
  if (extension === "png") return "image/png";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function mb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "4.2 MB → 310 KB (93% smaller)", or null when it barely moved. */
export function savingsLabel(item: PreparedMedia): string | null {
  const saved = 1 - item.blob.size / item.originalBytes;
  if (saved < 0.05) return null;

  return `${mb(item.originalBytes)} → ${mb(item.blob.size)} (${Math.round(
    saved * 100,
  )}% smaller)`;
}


// ============================================================
//  Avatars
//
//  Same argument as the feed, only sharper. An avatar is drawn at 96px
//  at the very largest — the profile header — and at 40px or less
//  almost everywhere else. Uploading the 3000x3000 original means every
//  screen showing a 40px circle downloads several megabytes to paint
//  about sixteen hundred pixels. A feed of twenty posts pays that
//  twenty times over.
//
//  256 is deliberately generous: it covers 96px at 2x with room to
//  spare, and still looks right on a 3x phone. Beyond that the file
//  grows and nothing on screen changes.
// ============================================================

/** Stored edge. Square, because every avatar is drawn in a circle. */
const AVATAR_EDGE = 256;

/** Avatars are usually photographs of something. 0.85 rather than the
 *  feed's 0.82 — the file is tiny either way at this size, so there's
 *  no reason to be stingy. */
const AVATAR_QUALITY = 0.85;

/** We resize, so there's no reason to refuse a normal phone photo.
 *  This only exists to stop someone opening a 200MB TIFF. */
const MAX_AVATAR_INPUT_BYTES = 25 * 1024 * 1024;

/** An animated GIF can't survive a canvas — it would come out as a
 *  still first frame. So GIFs pass through untouched, and the size cap
 *  stays tight to make up for not being able to shrink them. */
const MAX_AVATAR_GIF_BYTES = 2 * 1024 * 1024;

export type PreparedAvatar = {
  blob: Blob;
  extension: string;
  /** Edge length actually stored, for showing in the interface. */
  edge: number;
  previewUrl: string;
  originalBytes: number;
};

/**
 * Square-crops, resizes and re-encodes an avatar before upload.
 *
 * The centre crop happens here rather than at display time. It already
 * happened at display time — `object-cover` on a circle — but invisibly,
 * so a portrait upload lost its top and bottom with no warning and no
 * way to see it coming. Doing it up front means what's stored is what
 * people see.
 */
export async function prepareAvatar(file: File): Promise<PreparedAvatar> {
  if (!file.type.startsWith("image/")) {
    throw new MediaError("That's not an image.");
  }

  if (file.size > MAX_AVATAR_INPUT_BYTES) {
    throw new MediaError(
      `That image is ${mb(file.size)} — 25MB is the most I can open.`,
    );
  }

  // Animated, and a canvas would flatten it to frame one.
  if (file.type === "image/gif") {
    if (file.size > MAX_AVATAR_GIF_BYTES) {
      throw new MediaError(
        `Animated avatars have to be under 2MB — that one is ${mb(file.size)}.`,
      );
    }
    return {
      blob: file,
      extension: "gif",
      edge: 0,
      previewUrl: URL.createObjectURL(file),
      originalBytes: file.size,
    };
  }

  const bitmap = await decode(file);

  // Never upscale. A 64px source stays 64px rather than being blown up
  // to 256 and looking soft for it.
  const side = Math.min(bitmap.width, bitmap.height);
  const edge = Math.min(AVATAR_EDGE, side);
  const canvas = squareCrop(bitmap, side, edge);
  bitmap.close();

  let blob = await encode(canvas, "image/webp", AVATAR_QUALITY);
  let extension = "webp";

  if (!blob) {
    blob = await encode(canvas, "image/jpeg", AVATAR_QUALITY);
    extension = "jpg";
  }

  if (!blob) throw new MediaError("Couldn't read that image.");

  return {
    blob,
    extension,
    edge,
    previewUrl: URL.createObjectURL(blob),
    originalBytes: file.size,
  };
}

/** Centre-crops to a square and scales it to `edge`. */
function squareCrop(bitmap: ImageBitmap, side: number, edge: number) {
  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;

  const context = canvas.getContext("2d");
  if (!context) throw new MediaError("Couldn't process that image.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const sx = Math.round((bitmap.width - side) / 2);
  const sy = Math.round((bitmap.height - side) / 2);
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, edge, edge);

  return canvas;
}
