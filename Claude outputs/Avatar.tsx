import { parsePreset } from "../lib/avatars";

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
 */
export function Avatar({
  of,
  size = 44,
  className = "",
}: {
  of: Source;
  size?: number;
  className?: string;
}) {
  const preset = parsePreset(of.avatar_preset);
  const letter = (of.username ?? "?").charAt(0).toUpperCase();

  return (
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
  );
}
