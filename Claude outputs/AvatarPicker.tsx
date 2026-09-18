import { useRef, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { updateProfile, uploadAvatar, type Profile } from "../lib/profile";
import {
  AVATAR_SHAPES,
  AVATAR_COLORS,
  parsePreset,
  makePreset,
} from "../lib/avatars";
import { Avatar } from "./Avatar";
import { Alert } from "./ui";

export function AvatarPicker({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (updated: Profile) => void;
}) {
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = parsePreset(profile.avatar_preset);
  // Keep a colour selected even before they've chosen a symbol, so the
  // first click on a symbol produces something rather than nothing.
  const [colorKey, setColorKey] = useState(
    current?.color.key ?? AVATAR_COLORS[0].key,
  );

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
  }

  function pickColor(key: string) {
    setColorKey(key);
    if (current) {
      save({ avatar_preset: makePreset(current.shape.key, key), avatar_url: null });
    }
  }

  async function handleUpload(file: File) {
    if (!user) return;

    if (file.size > 2 * 1024 * 1024) {
      setError("That image is over 2 MB. Try a smaller one.");
      return;
    }

    setBusy(true);
    setError(null);

    const { url, error: uploadError } = await uploadAvatar(user.id, file);

    if (uploadError || !url) {
      setBusy(false);
      setError(uploadError?.message ?? "Upload failed.");
      return;
    }

    setBusy(false);
    save({ avatar_url: url });
  }

  return (
    <section className="mb-8 rounded-xl border border-line bg-surface p-5">
      <div className="mb-5 flex items-center gap-5">
        <Avatar of={profile} size={80} />

        <div className="flex-1">
          <p className="text-lg font-semibold">@{profile.username}</p>
          <p className="mb-3 text-xs text-muted">
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
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {busy ? "Working…" : "Upload a photo"}
            </button>

            {profile.avatar_url && (
              <button
                type="button"
                disabled={busy}
                onClick={() => save({ avatar_url: null })}
                className="rounded-lg px-3 py-1.5 text-xs text-muted transition hover:text-danger disabled:opacity-50"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Or pick one
      </p>

      <div className="mb-4 grid grid-cols-8 gap-2">
        {AVATAR_SHAPES.map((shape) => {
          const active = !profile.avatar_url && current?.shape.key === shape.key;
          return (
            <button
              key={shape.key}
              type="button"
              title={shape.label}
              disabled={busy}
              onClick={() => pickShape(shape.key)}
              className={
                "rounded-full border-2 p-0.5 transition disabled:opacity-50 " +
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
                size={40}
              />
            </button>
          );
        })}
      </div>

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Colour
      </p>

      <div className="flex gap-2">
        {AVATAR_COLORS.map((colour) => (
          <button
            key={colour.key}
            type="button"
            title={colour.label}
            disabled={busy}
            onClick={() => pickColor(colour.key)}
            className={
              "h-8 w-8 rounded-full border-2 transition disabled:opacity-50 " +
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
    </section>
  );
}
