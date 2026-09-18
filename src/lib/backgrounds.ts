/**
 * Built-in profile backgrounds.
 *
 * CSS rather than stock images: nothing to host, nothing to license,
 * nothing to moderate, and they load instantly. Anyone who wants
 * something specific uploads their own banner instead.
 *
 * Each entry can carry its own background-size and base colour, which
 * is what lets the tiled patterns work alongside the plain gradients.
 */

export type BackgroundGroup = "Gradients" | "Neon" | "Muted" | "Patterns";

export type Background = {
  key: string;
  label: string;
  group: BackgroundGroup;
  css: string;
  size?: string;
  color?: string;
};

export const BACKGROUNDS: Background[] = [
  // ---- Gradients ----------------------------------------------------
  { key: "slate", label: "Slate", group: "Gradients", css: "linear-gradient(135deg, #1c2130 0%, #2a3040 100%)" },
  { key: "ember", label: "Ember", group: "Gradients", css: "linear-gradient(135deg, #2b1414 0%, #7a2f2f 55%, #c2542f 100%)" },
  { key: "void", label: "Void", group: "Gradients", css: "linear-gradient(135deg, #12091f 0%, #3b1d6e 55%, #6d5efc 100%)" },
  { key: "moss", label: "Moss", group: "Gradients", css: "linear-gradient(135deg, #0e1c14 0%, #1f4a30 55%, #3ddc97 100%)" },
  { key: "tide", label: "Tide", group: "Gradients", css: "linear-gradient(135deg, #071a2b 0%, #12466e 55%, #35c0e8 100%)" },
  { key: "dusk", label: "Dusk", group: "Gradients", css: "linear-gradient(135deg, #1a1030 0%, #66275e 50%, #e0657a 100%)" },
  { key: "rust", label: "Rust", group: "Gradients", css: "linear-gradient(135deg, #22160c 0%, #6b3a12 55%, #d4893a 100%)" },
  { key: "frost", label: "Frost", group: "Gradients", css: "linear-gradient(135deg, #131b26 0%, #33506b 55%, #a8c6df 100%)" },
  { key: "aurora", label: "Aurora", group: "Gradients", css: "linear-gradient(135deg, #0b1220 0%, #1f6f6b 40%, #6d5efc 75%, #e0657a 100%)" },
  { key: "magma", label: "Magma", group: "Gradients", css: "linear-gradient(160deg, #0d0605 0%, #5c1206 45%, #d63a1a 80%, #f7a23b 100%)" },
  { key: "abyss", label: "Abyss", group: "Gradients", css: "linear-gradient(180deg, #050b14 0%, #0a2338 60%, #14526e 100%)" },
  { key: "orchid", label: "Orchid", group: "Gradients", css: "linear-gradient(135deg, #1a0f22 0%, #5b2a72 55%, #b968c7 100%)" },
  { key: "sunset", label: "Sunset", group: "Gradients", css: "linear-gradient(160deg, #1b1033 0%, #7c2f5c 45%, #e0654a 78%, #f6b352 100%)" },
  { key: "mint", label: "Mint", group: "Gradients", css: "linear-gradient(135deg, #0a1a1a 0%, #1c5450 55%, #6fe3c4 100%)" },
  { key: "sand", label: "Sand", group: "Gradients", css: "linear-gradient(135deg, #1a1712 0%, #5a4a32 55%, #c4a878 100%)" },
  { key: "bloodmoon", label: "Blood Moon", group: "Gradients", css: "radial-gradient(circle at 70% 25%, #ff4d4d 0%, #7a1020 25%, #2a0810 60%, #0a0407 100%)" },

  // ---- Neon ---------------------------------------------------------
  { key: "arcade", label: "Arcade", group: "Neon", css: "linear-gradient(120deg, #17061f 0%, #b4145f 45%, #f4a01c 100%)" },
  { key: "synthwave", label: "Synthwave", group: "Neon", css: "linear-gradient(180deg, #2b0b4d 0%, #7b1fa2 45%, #ff2e88 72%, #ffb03a 100%)" },
  { key: "cyber", label: "Cyber", group: "Neon", css: "linear-gradient(120deg, #04121a 0%, #0b6b7a 40%, #16e0c8 70%, #f5f749 100%)" },
  { key: "toxic", label: "Toxic", group: "Neon", css: "linear-gradient(135deg, #0a1405 0%, #2f6b0c 45%, #8ef227 100%)" },
  { key: "vapor", label: "Vapor", group: "Neon", css: "linear-gradient(135deg, #2a1b52 0%, #6b4fd6 35%, #f77ec0 70%, #7ce7f0 100%)" },
  { key: "laser", label: "Laser", group: "Neon", css: "linear-gradient(90deg, #12002b 0%, #5c00d6 30%, #ff0066 60%, #ff9c00 100%)" },
  {
    key: "mesh",
    label: "Mesh",
    group: "Neon",
    color: "#0b0d12",
    css: "radial-gradient(at 18% 22%, rgba(109,94,252,0.55) 0px, transparent 52%), radial-gradient(at 82% 28%, rgba(61,220,151,0.45) 0px, transparent 50%), radial-gradient(at 50% 88%, rgba(224,101,122,0.5) 0px, transparent 52%)",
  },

  // ---- Muted --------------------------------------------------------
  { key: "graphite", label: "Graphite", group: "Muted", css: "linear-gradient(135deg, #101319 0%, #1d222c 100%)" },
  { key: "midnight", label: "Midnight", group: "Muted", css: "linear-gradient(135deg, #080b12 0%, #141a28 100%)" },
  { key: "forest", label: "Forest", group: "Muted", css: "linear-gradient(135deg, #0c1410 0%, #1a2b21 100%)" },
  { key: "plum", label: "Plum", group: "Muted", css: "linear-gradient(135deg, #150e19 0%, #2b1c33 100%)" },
  { key: "ash", label: "Ash", group: "Muted", css: "linear-gradient(135deg, #16181b 0%, #2c3035 100%)" },
  { key: "ink", label: "Ink", group: "Muted", css: "linear-gradient(135deg, #0a0c10 0%, #11161f 60%, #1b2433 100%)" },

  // ---- Patterns -----------------------------------------------------
  {
    key: "carbon",
    label: "Carbon",
    group: "Patterns",
    css: "repeating-linear-gradient(45deg, #14181f 0px, #14181f 10px, #1b2029 10px, #1b2029 20px)",
  },
  {
    key: "grid",
    label: "Grid",
    group: "Patterns",
    color: "#0f131b",
    css: "linear-gradient(#1e2635 1px, transparent 1px), linear-gradient(90deg, #1e2635 1px, transparent 1px)",
    size: "28px 28px",
  },
  {
    key: "dots",
    label: "Dots",
    group: "Patterns",
    color: "#0f131b",
    css: "radial-gradient(#2f3645 1.5px, transparent 1.5px)",
    size: "18px 18px",
  },
  {
    key: "diagonal",
    label: "Diagonal",
    group: "Patterns",
    css: "repeating-linear-gradient(-45deg, #12161e 0px, #12161e 12px, #1a1f2b 12px, #1a1f2b 24px)",
  },
  {
    key: "scanlines",
    label: "Scanlines",
    group: "Patterns",
    color: "#0f0a1f",
    css: "repeating-linear-gradient(0deg, rgba(109,94,252,0.22) 0px, rgba(109,94,252,0.22) 2px, transparent 2px, transparent 6px)",
  },
  {
    key: "chevron",
    label: "Chevron",
    group: "Patterns",
    color: "#101520",
    css: "repeating-linear-gradient(135deg, #1a2130 0px, #1a2130 8px, transparent 8px, transparent 16px)",
  },
  {
    key: "circuit",
    label: "Circuit",
    group: "Patterns",
    color: "#081410",
    css: "linear-gradient(#123528 1px, transparent 1px), linear-gradient(90deg, #123528 1px, transparent 1px), radial-gradient(#2ba179 2px, transparent 2px)",
    size: "24px 24px, 24px 24px, 48px 48px",
  },
  {
    key: "embers",
    label: "Embers",
    group: "Patterns",
    color: "#140705",
    css: "radial-gradient(circle at 20% 70%, rgba(255,110,40,0.35) 0px, transparent 28%), radial-gradient(circle at 70% 35%, rgba(255,70,30,0.3) 0px, transparent 26%), radial-gradient(circle at 45% 90%, rgba(255,170,60,0.25) 0px, transparent 24%)",
  },

  // ---- Gradients, second set ----------------------------------------
  { key: "steel", label: "Steel", group: "Gradients", css: "linear-gradient(135deg, #1b1f26 0%, #39414f 100%)" },
  { key: "copper", label: "Copper", group: "Gradients", css: "linear-gradient(135deg, #1c120c 0%, #7a4326 55%, #d98a55 100%)" },
  { key: "jade", label: "Jade", group: "Gradients", css: "linear-gradient(135deg, #07160f 0%, #12503a 55%, #3fc58f 100%)" },
  { key: "violet", label: "Violet", group: "Gradients", css: "linear-gradient(135deg, #150d24 0%, #4b2a86 55%, #8f6bff 100%)" },
  { key: "coral", label: "Coral", group: "Gradients", css: "linear-gradient(135deg, #1e0f10 0%, #8a3340 55%, #ff8a6b 100%)" },
  { key: "glacier", label: "Glacier", group: "Gradients", css: "linear-gradient(180deg, #0a1620 0%, #1d4a63 60%, #7fd4e8 100%)" },
  { key: "berrywine", label: "Berry", group: "Gradients", css: "linear-gradient(160deg, #1a0a18 0%, #6b1c55 50%, #d94fa0 100%)" },
  { key: "olive", label: "Olive", group: "Gradients", css: "linear-gradient(135deg, #14160b 0%, #4a5220 55%, #a8b85a 100%)" },
  { key: "indigo", label: "Indigo", group: "Gradients", css: "linear-gradient(135deg, #0a0c1f 0%, #242b70 55%, #5a68d6 100%)" },
  { key: "peach", label: "Peach", group: "Gradients", css: "linear-gradient(135deg, #1f1410 0%, #8a4a32 50%, #ffb58a 100%)" },
  { key: "teal", label: "Teal", group: "Gradients", css: "linear-gradient(135deg, #061616 0%, #0f4a4a 55%, #3fc4c4 100%)" },
  { key: "smoke", label: "Smoke", group: "Gradients", css: "linear-gradient(135deg, #15171a 0%, #3a4048 60%, #727c88 100%)" },
  { key: "lagoon", label: "Lagoon", group: "Gradients", css: "linear-gradient(160deg, #04141c 0%, #0d5a6b 50%, #39d0c8 100%)" },
  { key: "clay", label: "Clay", group: "Gradients", css: "linear-gradient(135deg, #1a110d 0%, #6b3d2a 55%, #c98a63 100%)" },
  { key: "nightfall", label: "Nightfall", group: "Gradients", css: "linear-gradient(180deg, #0a0a16 0%, #1f2150 50%, #4a4f9e 80%, #8a6fb5 100%)" },
  { key: "eclipse", label: "Eclipse", group: "Gradients", css: "radial-gradient(circle at 50% 40%, #2b2b38 0%, #14141c 45%, #06060a 100%)" },

  // ---- Neon, second set ---------------------------------------------
  { key: "hotline", label: "Hotline", group: "Neon", css: "linear-gradient(135deg, #1a0426 0%, #ff2d75 50%, #ffca3a 100%)" },
  { key: "plasma", label: "Plasma", group: "Neon", css: "linear-gradient(120deg, #0a0220 0%, #4a00e0 40%, #8e2de2 70%, #ff4fd8 100%)" },
  { key: "acid", label: "Acid", group: "Neon", css: "linear-gradient(135deg, #0d1400 0%, #5c8f00 45%, #c4ff26 100%)" },
  { key: "glitch", label: "Glitch", group: "Neon", css: "linear-gradient(90deg, #04101a 0%, #00e5ff 35%, #ff00c8 70%, #ffe600 100%)" },
  { key: "retro", label: "Retro", group: "Neon", css: "linear-gradient(180deg, #1b0b3a 0%, #ff6f3c 55%, #ffd166 100%)" },
  { key: "ultraviolet", label: "Ultraviolet", group: "Neon", css: "linear-gradient(135deg, #0a0018 0%, #5b00b5 45%, #c44bff 80%, #ff9de0 100%)" },
  {
    key: "neonmesh",
    label: "Neon Mesh",
    group: "Neon",
    color: "#06040f",
    css: "radial-gradient(at 15% 80%, rgba(0,229,255,0.5) 0px, transparent 50%), radial-gradient(at 85% 20%, rgba(255,0,200,0.45) 0px, transparent 50%), radial-gradient(at 55% 55%, rgba(255,230,0,0.3) 0px, transparent 45%)",
  },

  // ---- Muted, second set --------------------------------------------
  { key: "stone", label: "Stone", group: "Muted", css: "linear-gradient(135deg, #121316 0%, #24272c 100%)" },
  { key: "moor", label: "Moor", group: "Muted", css: "linear-gradient(135deg, #0d1114 0%, #1b242a 100%)" },
  { key: "claydark", label: "Clay Dark", group: "Muted", css: "linear-gradient(135deg, #15110e 0%, #26201a 100%)" },
  { key: "navy", label: "Navy", group: "Muted", css: "linear-gradient(135deg, #080c14 0%, #141d2e 100%)" },
  { key: "mulberry", label: "Mulberry", group: "Muted", css: "linear-gradient(135deg, #130d13 0%, #251a26 100%)" },
  { key: "pine", label: "Pine", group: "Muted", css: "linear-gradient(135deg, #091210 0%, #152522 100%)" },
  { key: "charcoal", label: "Charcoal", group: "Muted", css: "linear-gradient(135deg, #0c0c0c 0%, #1c1c1c 100%)" },

  // ---- Patterns, second set ------------------------------------------
  {
    key: "crosshatch",
    label: "Crosshatch",
    group: "Patterns",
    color: "#0d1017",
    css: "repeating-linear-gradient(45deg, #1b2230 0px, #1b2230 1px, transparent 1px, transparent 12px), repeating-linear-gradient(-45deg, #1b2230 0px, #1b2230 1px, transparent 1px, transparent 12px)",
  },
  {
    key: "weave",
    label: "Weave",
    group: "Patterns",
    color: "#0e121a",
    css: "repeating-linear-gradient(0deg, #1a2230 0px, #1a2230 2px, transparent 2px, transparent 10px), repeating-linear-gradient(90deg, #1a2230 0px, #1a2230 2px, transparent 2px, transparent 10px)",
  },
  {
    key: "checker",
    label: "Checker",
    group: "Patterns",
    color: "#0f131b",
    css: "repeating-conic-gradient(#191f2a 0% 25%, #12161f 0% 50%)",
    size: "26px 26px",
  },
  {
    key: "ripple",
    label: "Ripple",
    group: "Patterns",
    color: "#0f131b",
    css: "repeating-radial-gradient(circle at 50% 50%, #161d29 0px, #161d29 1px, transparent 1px, transparent 14px)",
  },
  {
    key: "starfield",
    label: "Starfield",
    group: "Patterns",
    color: "#05070d",
    css: "radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.28) 1px, transparent 1px)",
    size: "58px 58px, 31px 31px",
  },
  {
    key: "stripes",
    label: "Stripes",
    group: "Patterns",
    css: "repeating-linear-gradient(90deg, #141922 0px, #141922 6px, #0f131b 6px, #0f131b 12px)",
  },
  {
    key: "glowgrid",
    label: "Glow Grid",
    group: "Patterns",
    color: "#080612",
    css: "linear-gradient(rgba(140,120,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(140,120,255,0.3) 1px, transparent 1px)",
    size: "34px 34px",
  },
];

export const GROUPS: BackgroundGroup[] = [
  "Gradients",
  "Neon",
  "Muted",
  "Patterns",
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
      backgroundSize: preset.size,
      backgroundColor: preset.color,
    };
  }

  return { backgroundColor: "var(--color-surface-2)" };
}
