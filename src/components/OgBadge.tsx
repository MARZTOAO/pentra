/**
 * "PENTRA OG #42 of 1,000".
 *
 * For the first 1,000 real players, numbered in the order their email
 * was confirmed. The number is given by the database and never changes
 * or passes to anyone else (supabase/76_pentra_og.sql); seeded test
 * accounts never get one. Design: MARZ picked option A's solid orange
 * with option C's "of 1,000" wording, 2026-09-26.
 */
export function OgBadge({ number }: { number: number }) {
  const label = `Pentra OG #${number.toLocaleString("en-US")} of 1,000`;

  return (
    <span
      title="One of the first 1,000 players on Pentra."
      aria-label={label}
      className="notch-sm inline-flex items-center gap-1.5 bg-accent py-0.5 pl-1.5 pr-2 font-display text-[11px] uppercase tracking-[0.06em] text-onaccent"
    >
      <PentraMark />
      Pentra OG
      <span className="numeric font-bold normal-case tracking-normal opacity-75">
        #{number.toLocaleString("en-US")} of 1,000
      </span>
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
