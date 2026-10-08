/**
 * "PRO" — the Pentra Pro member badge.
 *
 * Gold, on purpose: the OG badge is the app's orange, so the paid
 * badge needed to read as something else at a glance without adding a
 * new colour to the palette. Gold is orange's richer cousin. Design
 * option A, chosen by MARZ 2026-09-26.
 *
 * Shown while `hasPlus(profile)` is true — tier 'plus' and not expired.
 * The tier itself can only be set by billing (supabase/10_tiers.sql),
 * so this can't be faked by editing a profile.
 */
export function ProBadge() {
  return (
    <span
      title="Pentra Pro member."
      aria-label="Pentra Pro member"
      className="chip relative pr-3 font-display uppercase tracking-[0.14em] text-onaccent"
      style={{
        background:
          "linear-gradient(115deg, #ffe29a 0%, #f7b733 28%, #ff9a3c 55%, #ffd36b 100%)",
        boxShadow:
          "inset 0 0 0 1px rgba(255, 211, 107, 0.55), 0 0 14px rgba(255, 180, 60, 0.45)",
      }}
    >
      <PentraMark />
      Pro
      {/* The sparkle. Decorative; it's what makes it read as gold
          rather than yellow. */}
      <span
        aria-hidden="true"
        className="absolute -top-0.5 right-1.5 h-[5px] w-[5px] bg-white opacity-90"
        style={{
          clipPath:
            "polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)",
        }}
      />
    </span>
  );
}

/** The Pentra mark, filled with the text colour. brand/pentra-mark.svg. */
function PentraMark() {
  return (
    <svg
      className="h-3 w-3 shrink-0"
      viewBox="14.67 7.7 993.65 978.71"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M511.5 81.26L956.35 404.46L786.43 927.41L236.57 927.41L66.65 404.46ZM160.7 435.02L294.69 847.41L728.31 847.41L862.3 435.02L511.5 180.14ZM388.5 130.7A123 123 0 0 1 634.5 130.7A123 123 0 0 1 388.5 130.7ZM810.33 419.74A99 99 0 0 1 1008.33 419.74A99 99 0 0 1 810.33 419.74ZM658.37 887.41A99 99 0 0 1 856.37 887.41A99 99 0 0 1 658.37 887.41ZM166.63 887.41A99 99 0 0 1 364.63 887.41A99 99 0 0 1 166.63 887.41ZM14.67 419.74A99 99 0 0 1 212.67 419.74A99 99 0 0 1 14.67 419.74Z" />
    </svg>
  );
}
