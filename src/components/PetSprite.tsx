import { useState } from "react";
import { eggSvg, petSvg } from "../lib/petArt";

/**
 * The pet, drawn. A placeholder until the artwork arrives.
 *
 * MARZ is getting art made. When it's ready, drop PNGs into
 * `public/pets/` named `<species>-<stage>.png` (e.g. `blip-2.png`) and
 * `egg.png`, then set ART_READY below to true; this component then
 * tries the image first and falls back to the built-in shape for any
 * file that isn't there. Nothing else changes.
 *
 * The drawings themselves live in src/lib/petArt.ts (pure functions
 * returning SVG markup) so the same code draws the card, the mini game
 * and the preview sheet. A napping pet (hunger or mood at 0) is dimmed
 * with closed eyes.
 */

/** Flip to true once the PNGs are in public/pets/. */
const ART_READY = false;

type Props = {
  species: string | null;
  shape: string | null;
  color: string | null;
  edge: string | null;
  stage: 1 | 2 | 3;
  napping?: boolean;
  isEgg?: boolean;
  /** Pixel size; the SVG is square. */
  size?: number;
  className?: string;
};

export function PetSprite({ species, shape, color, edge, stage, napping, isEgg, size = 96, className }: Props) {
  const src = !ART_READY ? null : isEgg ? "/pets/egg.png" : species ? `/pets/${species}-${stage}.png` : null;
  // Which image failed to load, so a new stage's image still gets tried.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt=""
        draggable={false}
        onError={() => setFailedSrc(src)}
        className={`${napping ? "opacity-50 grayscale" : ""} ${className ?? ""}`}
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    );
  }

  const inner = isEgg ? eggSvg() : petSvg({ shape, color, edge, stage, napping });
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      className={`${napping && !isEgg ? "opacity-60 grayscale-[40%]" : ""} ${className ?? ""}`}
      // Markup from our own pure drawing functions (src/lib/petArt.ts),
      // never from user input.
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
