import { useEffect, useRef, useState } from "react";
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

  // Close on a click outside or on Escape. Both are expected of a
  // dropdown, and leaving either out makes it feel broken.
  useEffect(() => {
    if (!open) return;

    function onClick(e: MouseEvent) {
      if (!dropdown.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
      <div className="flex items-center gap-5">
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
            {/* The dropdown */}
            <div className="relative" ref={dropdown}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen((v) => !v)}
                className={
                  "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 " +
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

              {open && (
                <div className="absolute left-0 top-full z-40 mt-2 w-[22rem] rounded-xl border border-line bg-surface p-3 shadow-2xl">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
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

                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Symbol
                  </p>
                  <div className="grid max-h-64 grid-cols-8 gap-1.5 overflow-y-auto pr-1">
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
              )}
            </div>

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

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}
    </section>
  );
}
