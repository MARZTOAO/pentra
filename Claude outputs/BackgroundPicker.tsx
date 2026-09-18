import { useRef, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { updateProfile, uploadBanner, type Profile } from "../lib/profile";
import { BACKGROUNDS, bannerStyle } from "../lib/backgrounds";
import { Alert } from "./ui";

export function BackgroundPicker({
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

  async function choosePreset(key: string) {
    if (!user) return;
    setBusy(true);
    setError(null);

    // Picking a preset clears any uploaded banner, otherwise the image
    // would keep winning and the click would appear to do nothing.
    const { data, error } = await updateProfile(user.id, {
      background: key,
      banner_url: null,
    });

    setBusy(false);
    if (error) setError(error.message);
    else onChange(data as Profile);
  }

  async function handleUpload(file: File) {
    if (!user) return;

    if (file.size > 4 * 1024 * 1024) {
      setError("That image is over 4 MB. Try a smaller one.");
      return;
    }

    setBusy(true);
    setError(null);

    const { url, error: uploadError } = await uploadBanner(user.id, file);

    if (uploadError || !url) {
      setBusy(false);
      setError(uploadError?.message ?? "Upload failed.");
      return;
    }

    const { data, error: saveError } = await updateProfile(user.id, {
      banner_url: url,
    });

    setBusy(false);
    if (saveError) setError(saveError.message);
    else onChange(data as Profile);
  }

  async function clearBanner() {
    if (!user) return;
    setBusy(true);
    const { data, error } = await updateProfile(user.id, { banner_url: null });
    setBusy(false);
    if (error) setError(error.message);
    else onChange(data as Profile);
  }

  return (
    <section className="mb-8 rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
        Profile background
      </h2>
      <p className="mb-4 text-xs text-muted">
        Saves as soon as you pick one — no separate save button.
      </p>

      {error && <Alert>{error}</Alert>}

      {/* Live preview at the real aspect ratio */}
      <div
        className="mb-4 h-28 w-full rounded-lg border border-line"
        style={bannerStyle(profile)}
      />

      <div className="mb-4 grid grid-cols-6 gap-2">
        {BACKGROUNDS.map((bg) => {
          const active = !profile.banner_url && profile.background === bg.key;
          return (
            <button
              key={bg.key}
              type="button"
              title={bg.label}
              disabled={busy}
              onClick={() => choosePreset(bg.key)}
              className={
                "h-12 rounded-lg border-2 transition disabled:opacity-50 " +
                (active
                  ? "border-accent"
                  : "border-transparent hover:border-muted")
              }
              style={bannerStyle({ background: bg.key })}
            >
              <span className="sr-only">{bg.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />

        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {busy ? "Working…" : "Upload your own"}
        </button>

        {profile.banner_url && (
          <button
            type="button"
            disabled={busy}
            onClick={clearBanner}
            className="rounded-lg px-3 py-1.5 text-xs text-muted transition hover:text-danger disabled:opacity-50"
          >
            Remove image
          </button>
        )}

        <p className="ml-auto text-xs text-muted">
          Wide images work best. Up to 4 MB.
        </p>
      </div>
    </section>
  );
}
