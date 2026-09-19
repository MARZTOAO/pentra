import { useRef, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { updateProfile, type Profile } from "../lib/profile";
import {
  BACKGROUNDS,
  GROUPS,
  bannerStyle,
  findBackground,
} from "../lib/backgrounds";
import { Anchored } from "./Anchored";
import { Alert } from "./ui";

export function BackgroundPicker({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (updated: Profile) => void;
}) {
  const { user } = useAuth();
  const dropdown = useRef<HTMLDivElement>(null);

  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = profile.banner_url ? null : findBackground(profile.background);

  // Dismissal lives in <Anchored>: the panel is portalled to <body>, so a
  // contains() check against this trigger would close it on its own clicks.

  async function save(patch: Parameters<typeof updateProfile>[1]) {
    if (!user) return;
    setBusy(true);
    setError(null);

    const { data, error } = await updateProfile(user.id, patch);

    setBusy(false);
    if (error) setError(error.message);
    else onChange(data as Profile);
  }

  function choosePreset(key: string) {
    // Clearing banner_url as well, so anyone who uploaded one back when
    // that was possible isn't stuck with it overriding their choice.
    save({ background: key, banner_url: null });
    setOpen(false);
  }

  const label = profile.banner_url
    ? "Your old image"
    : current
      ? current.label
      : "None";

  return (
    <section className="mb-8 notch border border-line bg-surface p-5">
      <h2 className="mb-3 label-wide text-muted">
        Profile background
      </h2>

      {error && <Alert>{error}</Alert>}

      <div className="flex items-center gap-4">
        {/* Preview stays visible - it's the thing you're actually choosing. */}
        <div
          className="h-16 w-28 shrink-0 notch-md border border-line"
          style={bannerStyle(profile)}
        />

        <div className="flex flex-1 flex-wrap items-center gap-2">
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
              Background: {label}
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
              <Anchored
                anchorRef={dropdown}
                onClose={() => setOpen(false)}
                width={416}
              >
              <div className="max-h-80 overflow-y-auto overflow-x-hidden notch border border-line bg-surface p-3">
                {GROUPS.map((group) => (
                  <div key={group} className="mb-3 last:mb-0">
                    <p className="label-wide mb-1.5 text-muted">
                      {group}
                    </p>
                    <div className="grid grid-cols-8 gap-1.5">
                      {BACKGROUNDS.filter((bg) => bg.group === group).map((bg) => {
                        const active =
                          !profile.banner_url && profile.background === bg.key;
                        return (
                          <button
                            key={bg.key}
                            type="button"
                            title={bg.label}
                            onClick={() => choosePreset(bg.key)}
                            className={
                              "h-9 notch-sm border-2 transition " +
                              (active
                                ? "border-accent ring-2 ring-accent/30"
                                : "border-transparent hover:border-muted")
                            }
                            style={bannerStyle({ background: bg.key })}
                          >
                            <span className="sr-only">{bg.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              </Anchored>
            )}
          </div>

          <p className="numeric text-xs text-muted">
            {BACKGROUNDS.length} to choose from.
          </p>
        </div>
      </div>
    </section>
  );
}
