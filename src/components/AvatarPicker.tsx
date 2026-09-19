import { useRef, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { updateProfile, uploadAvatar, type Profile } from "../lib/profile";
import { prepareAvatar, MediaError } from "../lib/media";
import {
  AVATAR_SHAPES,
  AVATAR_COLORS,
  parsePreset,
  makePreset,
} from "../lib/avatars";
import { Avatar } from "./Avatar";
import { Anchored } from "./Anchored";
import { Alert } from "./ui";
import { PresencePicker } from "./PresencePicker";

export function AvatarPicker({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (updated: Profile) => void;
}) {
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);

  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = parsePreset(profile.avatar_preset);

  // Keep a colour selected even before they've chosen a symbol, so the
  // first click on a symbol produces something rather than nothing.
  const [colorKey, setColorKey] = useState(
    current?.color.key ?? AVATAR_COLORS[0].key,
  );

  // Closing on an outside click or Escape now lives in <Anchored>, which
  // has to own it: the panel is portalled to <body>, so it isn't a DOM
  // descendant of this trigger any more and a check here would read every
  // click inside the panel as an outside click.

  async function save(patch: Parameters<typeof updateProfile>[1]) {
    if (!user) return;
    setBusy(true);
    setError(null);

    const { data, error } = await updateProfile(user.id, patch);

    setBusy(false);
    if (error) setError(error.message);
    else onChange(data as Profile);
  }

  function pickShape(shapeKey: string) {
    // Choosing a premade avatar clears the upload, or the photo would
    // keep winning and the click would look like it did nothing.
    save({ avatar_preset: makePreset(shapeKey, colorKey), avatar_url: null });
    setOpen(false);
  }

  function pickColor(key: string) {
    setColorKey(key);
    if (current) {
      save({ avatar_preset: makePreset(current.shape.key, key), avatar_url: null });
    }
  }

  async function handleUpload(file: File) {
    if (!user) return;

    setBusy(true);
    setError(null);

    // Resized to 256px square on this machine before anything is sent.
    // An avatar is drawn at 96px at the very largest, so uploading the
    // original means everyone downloads megabytes to paint a 40px
    // circle in the feed. See prepareAvatar() for the arithmetic.
    let prepared;
    try {
      prepared = await prepareAvatar(file);
    } catch (problem) {
      setBusy(false);
      setError(
        problem instanceof MediaError
          ? problem.message
          : "Couldn't process that image.",
      );
      return;
    }

    const { url, error: uploadError } = await uploadAvatar(
      user.id,
      prepared.blob,
      prepared.extension,
    );

    setBusy(false);

    if (uploadError || !url) {
      setError(uploadError?.message ?? "Upload failed.");
      return;
    }

    URL.revokeObjectURL(prepared.previewUrl);
    save({ avatar_url: url });
  }

  return (
    <section className="mb-8 notch border border-line bg-surface p-5">
      <div className="flex items-center gap-5">
        <Avatar of={profile} size={80} />

        <div className="flex-1">
          {/* Name and status on one line — the status is about you, so
              it belongs beside your name rather than buried in settings.
              Wraps on a narrow screen instead of squeezing the name. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="display text-lg">@{profile.username}</p>
            <PresencePicker />
          </div>
          <p className="mb-3 mt-1 text-xs text-muted">
            Your username can't be changed for now.
          </p>

          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />

          <div className="flex items-center gap-2">
            {/* The dropdown */}
            <div className="relative" ref={dropdown}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen((v) => !v)}
                className={
                  "flex items-center gap-2 notch-md border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 " +
                  (open
                    ? "border-accent text-accent"
                    : "border-line text-muted hover:border-accent hover:text-accent")
                }
              >
                {current ? `Avatar: ${current.shape.label}` : "Choose an avatar"}
                <svg
                  className={"h-3 w-3 transition " + (open ? "rotate-180" : "")}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {/* Panel width: 7 x 42px cells + 6 x 6px gaps = 330, plus the
                  scroll gutter and the panel's own padding. 380 leaves room
                  for a Windows scrollbar without the last column clipping. */}
              {open && (
                <Anchored
                  anchorRef={dropdown}
                  onClose={() => setOpen(false)}
                  width={380}
                >
                <div className="notch border border-line bg-surface p-3">
                  <p className="label-wide mb-2 text-muted">
                    Colour
                  </p>
                  <div className="mb-3 flex gap-2">
                    {AVATAR_COLORS.map((colour) => (
                      <button
                        key={colour.key}
                        type="button"
                        title={colour.label}
                        onClick={() => pickColor(colour.key)}
                        className={
                          "h-7 w-7 rounded-full border-2 transition " +
                          (colorKey === colour.key
                            ? "border-accent ring-2 ring-accent/30"
                            : "border-transparent hover:border-muted")
                        }
                        style={{ backgroundImage: colour.bg }}
                      >
                        <span className="sr-only">{colour.label}</span>
                      </button>
                    ))}
                  </div>

                  <p className="label-wide mb-2 text-muted">
                    Symbol
                  </p>
                  {/* Seven across. `overflow-x-hidden` is load-bearing: the
                      vertical scrollbar eats into the row width, which was
                      enough to make the grid overflow sideways and give the
                      panel a horizontal scroll as well as a vertical one. */}
                  <div className="grid max-h-64 grid-cols-7 gap-1.5 overflow-y-auto overflow-x-hidden pr-1">
                    {AVATAR_SHAPES.map((shape) => {
                      const active =
                        !profile.avatar_url && current?.shape.key === shape.key;
                      return (
                        <button
                          key={shape.key}
                          type="button"
                          title={shape.label}
                          onClick={() => pickShape(shape.key)}
                          className={
                            "rounded-full border-2 p-0.5 transition " +
                            (active
                              ? "border-accent ring-2 ring-accent/30"
                              : "border-transparent hover:border-muted")
                          }
                        >
                          <Avatar
                            of={{
                              username: profile.username,
                              avatar_preset: makePreset(shape.key, colorKey),
                            }}
                            size={34}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
                </Anchored>
              )}
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="notch-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {busy ? "Working…" : "Upload a photo"}
            </button>

            {profile.avatar_url && (
              <button
                type="button"
                disabled={busy}
                onClick={() => save({ avatar_url: null })}
                className="notch-md px-3 py-1.5 text-xs text-muted transition hover:text-danger disabled:opacity-50"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}
    </section>
  );
}
