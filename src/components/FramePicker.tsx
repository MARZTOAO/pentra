import { useState, type ReactNode } from "react";
import { useAuth } from "../lib/AuthContext";
import { hasPlus, updateProfile, type Profile } from "../lib/profile";
import { FRAMES, frameOf, rememberFrame } from "../lib/frames";
import { Avatar } from "./Avatar";
import { ProBadge } from "./ProBadge";
import { Alert } from "./ui";

/**
 * Choose an avatar frame. Pentra Pro only — the section doesn't
 * appear for anyone else (the upsell belongs with the Pro section in
 * Settings, once there is something to buy). The database enforces
 * the rule regardless; see supabase/78.
 */
export function FramePicker({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (updated: Profile) => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasPlus(profile)) return null;

  const current = frameOf(profile);

  async function choose(key: string | null) {
    if (!user || busy || key === current) return;
    setBusy(true);
    setError(null);

    const { data, error } = await updateProfile(user.id, { avatar_frame: key });

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    const updated = data as Profile;
    onChange(updated);
    // Every avatar of yours on screen — the header, a post you made —
    // picks the change up without waiting for its cache to expire.
    rememberFrame(updated.username, frameOf(updated));
  }

  return (
    <section className="mb-8 notch border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="label-wide text-muted">Avatar frame</h2>
        <ProBadge />
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        {/* Preview at the size the profile header shows it. Kept apart
            from the choices so the frame has room to reach past the
            circle without crowding them. */}
        <div className="flex shrink-0 flex-col items-center gap-2 px-3 py-2">
          <Avatar of={profile} size={80} frame={current} />
          <p className="text-xs text-muted">
            {current ? FRAMES.find((f) => f.key === current)?.label : "No frame"}
          </p>
        </div>

        <div className="grid flex-1 grid-cols-4 gap-2 sm:grid-cols-7">
          <FrameOption
            label="None"
            active={current === null}
            disabled={busy}
            onClick={() => choose(null)}
          >
            <Avatar of={profile} size={40} frame={null} />
          </FrameOption>

          {FRAMES.map((f) => (
            <FrameOption
              key={f.key}
              label={f.label}
              title={f.blurb + (f.spin ? " Turns slowly." : "")}
              active={current === f.key}
              disabled={busy}
              onClick={() => choose(f.key)}
            >
              <Avatar of={profile} size={40} frame={f.key} />
            </FrameOption>
          ))}
        </div>
      </div>
    </section>
  );
}

function FrameOption({
  label,
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={
        "flex flex-col items-center gap-1.5 notch-sm border-2 px-1 pb-1.5 pt-3 transition disabled:opacity-60 " +
        (active
          ? "border-accent ring-2 ring-accent/30"
          : "border-transparent hover:border-muted")
      }
    >
      {children}
      <span className={"text-[11px] " + (active ? "text-accent" : "text-muted")}>
        {label}
      </span>
    </button>
  );
}
