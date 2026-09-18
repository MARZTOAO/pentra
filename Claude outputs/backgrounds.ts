/**
 * Built-in profile backgrounds.
 *
 * Gradients rather than stock images on purpose: nothing to host, nothing
 * to moderate, and they never clash with the dark interface. Anyone who
 * wants something specific can upload their own banner instead.
 */

export type Background = {
  key: string;
  label: string;
  css: string;
};

export const BACKGROUNDS: Background[] = [
  {
    key: "slate",
    label: "Slate",
    css: "linear-gradient(135deg, #1c2130 0%, #2a3040 100%)",
  },
  {
    key: "ember",
    label: "Ember",
    css: "linear-gradient(135deg, #2b1414 0%, #7a2f2f 55%, #c2542f 100%)",
  },
  {
    key: "void",
    label: "Void",
    css: "linear-gradient(135deg, #12091f 0%, #3b1d6e 55%, #6d5efc 100%)",
  },
  {
    key: "moss",
    label: "Moss",
    css: "linear-gradient(135deg, #0e1c14 0%, #1f4a30 55%, #3ddc97 100%)",
  },
  {
    key: "tide",
    label: "Tide",
    css: "linear-gradient(135deg, #071a2b 0%, #12466e 55%, #35c0e8 100%)",
  },
  {
    key: "dusk",
    label: "Dusk",
    css: "linear-gradient(135deg, #1a1030 0%, #66275e 50%, #e0657a 100%)",
  },
  {
    key: "rust",
    label: "Rust",
    css: "linear-gradient(135deg, #22160c 0%, #6b3a12 55%, #d4893a 100%)",
  },
  {
    key: "arcade",
    label: "Arcade",
    css: "linear-gradient(120deg, #17061f 0%, #b4145f 45%, #f4a01c 100%)",
  },
  {
    key: "frost",
    label: "Frost",
    css: "linear-gradient(135deg, #131b26 0%, #33506b 55%, #a8c6df 100%)",
  },
  {
    key: "carbon",
    label: "Carbon",
    css: "repeating-linear-gradient(45deg, #14181f 0px, #14181f 10px, #1b2029 10px, #1b2029 20px)",
  },
  {
    key: "grid",
    label: "Grid",
    css: "linear-gradient(#1a1f2b 1px, transparent 1px), linear-gradient(90deg, #1a1f2b 1px, transparent 1px), #0f131b",
  },
  {
    key: "aurora",
    label: "Aurora",
    css: "linear-gradient(135deg, #0b1220 0%, #1f6f6b 40%, #6d5efc 75%, #e0657a 100%)",
  },
];

export function findBackground(key: string | null | undefined) {
  return BACKGROUNDS.find((b) => b.key === key) ?? null;
}

/**
 * The style to put on the banner element.
 * An uploaded image beats a preset; a preset beats the plain surface.
 */
export function bannerStyle(p: {
  banner_url?: string | null;
  background?: string | null;
}): React.CSSProperties {
  if (p.banner_url) {
    return {
      backgroundImage: `url(${p.banner_url})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  const preset = findBackground(p.background);
  if (preset) {
    return {
      backgroundImage: preset.css,
      // Only the grid preset needs a tile size; harmless for the others.
      backgroundSize: preset.key === "grid" ? "28px 28px" : undefined,
    };
  }

  return { backgroundColor: "var(--color-surface-2)" };
}
