import { useRef, useState } from "react";
import {
  prepareMedia,
  savingsLabel,
  mb,
  MediaError,
  MAX_ATTACHMENTS,
  ACCEPTED_TYPES,
  type PreparedMedia,
} from "../lib/media";

/**
 * Attaching photos and GIFs to a post.
 *
 * Split into a hook and two pieces because the thumbnails belong under
 * the text box while the button belongs in the row of controls beneath
 * them — one component rendering both would force them to sit together.
 *
 * All the work happens before anything is uploaded: files are resized
 * and re-encoded on this machine, and what's shown is the result, not
 * the original. The size under each thumbnail is what the post will
 * actually cost someone to load.
 */
export function useAttachments(
  items: PreparedMedia[],
  onChange: (next: PreparedMedia[]) => void,
) {
  const input = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const room = MAX_ATTACHMENTS - items.length;

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;

    setError(null);

    const chosen = Array.from(files).slice(0, room);
    if (files.length > room) {
      setError(`Four at a time — taking the first ${room === 1 ? "one" : room}.`);
    }

    setWorking(chosen.length);

    const done: PreparedMedia[] = [];

    for (const file of chosen) {
      try {
        done.push(await prepareMedia(file));
      } catch (e) {
        setError(
          e instanceof MediaError ? e.message : `Couldn't read ${file.name}.`,
        );
      }
      setWorking((n) => n - 1);
    }

    if (done.length > 0) onChange([...items, ...done]);
    if (input.current) input.current.value = "";
  }

  function remove(i: number) {
    URL.revokeObjectURL(items[i].previewUrl);
    onChange(items.filter((_, n) => n !== i));
  }

  return { items, input, working, error, room, add, remove };
}

export type AttachmentState = ReturnType<typeof useAttachments>;

export function AttachmentThumbs({ attach }: { attach: AttachmentState }) {
  const { items, working, error, remove } = attach;

  if (items.length === 0 && working === 0 && !error) return null;

  return (
    <>
      {(items.length > 0 || working > 0) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.map((item, i) => (
            <figure
              key={item.previewUrl}
              className="w-28 overflow-hidden notch-md border border-line bg-surface-2"
            >
              <div className="relative h-20 w-full">
                {item.kind === "video" ? (
                  <video
                    src={item.previewUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}

                {item.kind === "video" && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold text-white">
                    GIF
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="Remove attachment"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-white transition hover:bg-danger"
                >
                  ×
                </button>
              </div>

              {/* What the compression actually achieved. Worth showing:
                  it's the difference between trusting the app with a
                  4MB photo and not bothering. */}
              <figcaption className="px-1.5 py-1 text-[10px] leading-tight text-muted">
                {savingsLabel(item) ?? mb(item.blob.size)}
              </figcaption>
            </figure>
          ))}

          {working > 0 && (
            <div className="flex h-[104px] w-28 flex-col items-center justify-center gap-2 notch-md border border-dashed border-line">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent" />
              <span className="px-1 text-center text-[10px] leading-tight text-muted">
                Compressing…
              </span>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </>
  );
}

export function AttachButton({
  attach,
  disabled,
}: {
  attach: AttachmentState;
  disabled?: boolean;
}) {
  const { input, room, working, add } = attach;

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        hidden
        onChange={(e) => add(e.target.files)}
      />

      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled || room === 0 || working > 0}
        title={
          room === 0 ? "Four attachments is the limit" : "Add a photo or GIF"
        }
        className="whitespace-nowrap rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-accent disabled:opacity-40"
      >
        + Photo
      </button>
    </>
  );
}
