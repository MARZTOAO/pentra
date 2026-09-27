import { parsePreset } from "../lib/avatars";
import { useAvatarFrame } from "../lib/frames";
import { AvatarFrame } from "./AvatarFrame";

type Source = {
  username?: string | null;
  avatar_url?: string | null;
  avatar_preset?: string | null;
};

/**
 * One component for every avatar in the app.
 *
 * Falls back in order: uploaded image, then premade preset, then the
 * first letter of their username. Having this in one place means a
 * change to how avatars look lands everywhere at once — before this
 * the same markup was copied into four screens.
 *
 * Pentra Pro members can wear a frame (lib/frames.ts). It is looked up
 * by username and drawn around the circle; the wrapper keeps the same
 * footprint as before, so nothing around it moves. Pass `frame` to
 * choose one explicitly (the picker's preview) or null to force none.
 */
export function Avatar({
  of,
  size = 44,
  className = "",
  frame,
}: {
  of: Source;
  size?: number;
  className?: string;
  frame?: string | null;
}) {
  const preset = parsePreset(of.avatar_preset);
  const letter = (of.username ?? "?").charAt(0).toUpperCase();
  const worn = useAvatarFrame(of.username, frame);

  return (
    <span
      className="relative inline-block shrink-0 align-top"
      style={{ width: size, height: size }}
    >
      <div
        className={`overflow-hidden rounded-full border border-line bg-surface-2 ${className}`}
        style={{ width: size, height: size }}
      >
        {of.avatar_url ? (
          <img src={of.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : preset ? (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ backgroundImage: preset.color.bg, color: preset.color.fg }}
          >
            <svg
              viewBox="0 0 24 24"
              width="62%"
              height="62%"
              aria-hidden="true"
              style={{ display: "block" }}
            >
              {preset.shape.glyph}
            </svg>
          </div>
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-bold text-muted"
            style={{ fontSize: size * 0.42 }}
          >
            {letter}
          </div>
        )}
      </div>

      {worn && <AvatarFrame frame={worn} size={size} />}
    </span>
  );
}
