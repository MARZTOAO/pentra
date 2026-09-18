/**
 * App colour palettes.
 *
 * Every colour in the interface is a CSS variable, so switching themes
 * is just rewriting those variables on the root element - no component
 * knows or cares which palette is active.
 *
 * `onaccent` is the text colour that sits ON a filled accent button.
 * It exists because hardcoding white breaks the moment someone picks a
 * pale accent - white on white is an invisible button.
 */

export type Palette = {
  key: string;
  label: string;
  mode: "dark" | "light";
  swatch: [string, string, string];
  vars: Record<string, string>;
};

function make(
  key: string,
  label: string,
  mode: "dark" | "light",
  v: {
    bg: string;
    surface: string;
    surface2: string;
    line: string;
    ink: string;
    muted: string;
    accent: string;
    accentHi: string;
    onaccent: string;
    ok?: string;
    danger?: string;
  },
): Palette {
  return {
    key,
    label,
    mode,
    swatch: [v.bg, v.surface2, v.accent],
    vars: {
      "--color-bg": v.bg,
      "--color-surface": v.surface,
      "--color-surface-2": v.surface2,
      "--color-line": v.line,
      "--color-ink": v.ink,
      "--color-muted": v.muted,
      "--color-accent": v.accent,
      "--color-accent-hi": v.accentHi,
      "--color-onaccent": v.onaccent,
      "--color-ok": v.ok ?? "#3ddc97",
      "--color-danger": v.danger ?? "#ff6b6b",
    },
  };
}

export const PALETTES: Palette[] = [
  // ---- Dark ---------------------------------------------------------
  make("carbon", "Carbon", "dark", {
    bg: "#0e0f11", surface: "#17191d", surface2: "#1f2227", line: "#2e3239",
    ink: "#e9ebee", muted: "#8d939c", accent: "#ff7a2f", accentHi: "#ff9354",
    onaccent: "#1a0d04", ok: "#4ed07a",
  }),
  make("midnight", "Midnight", "dark", {
    bg: "#0b0d12", surface: "#141822", surface2: "#1c2130", line: "#2a3040",
    ink: "#e8eaf0", muted: "#8b93a7", accent: "#6d5efc", accentHi: "#8478ff",
    onaccent: "#ffffff",
  }),
  make("nebula", "Nebula", "dark", {
    bg: "#0d0818", surface: "#17102a", surface2: "#211738", line: "#33254f",
    ink: "#ece7f7", muted: "#9b8fc0", accent: "#b96bff", accentHi: "#cb8bff",
    onaccent: "#14071f", ok: "#4fe0b0", danger: "#ff6f91",
  }),
  make("ocean", "Ocean", "dark", {
    bg: "#05121c", surface: "#0b1e2d", surface2: "#12293c", line: "#1d3d55",
    ink: "#e4f0f7", muted: "#7fa3ba", accent: "#2fb4e8", accentHi: "#55c8f5",
    onaccent: "#041722",
  }),
  make("forest", "Forest", "dark", {
    bg: "#081109", surface: "#0f1c12", surface2: "#16281b", line: "#234029",
    ink: "#e6f0e7", muted: "#85a48d", accent: "#4fc46b", accentHi: "#6fe089",
    onaccent: "#05160a", ok: "#4fc46b",
  }),
  make("crimson", "Crimson", "dark", {
    bg: "#120709", surface: "#1e0e12", surface2: "#2a151a", line: "#442028",
    ink: "#f5e9eb", muted: "#b08b92", accent: "#ff4d5e", accentHi: "#ff6e7c",
    onaccent: "#1a0508", danger: "#ff4d5e",
  }),
  make("amber", "Amber", "dark", {
    bg: "#120e07", surface: "#1e1810", surface2: "#2a2217", line: "#443722",
    ink: "#f5efe3", muted: "#b2a184", accent: "#f0a02c", accentHi: "#ffb852",
    onaccent: "#1a1104", ok: "#7fd14f",
  }),
  make("mono", "Mono", "dark", {
    bg: "#0a0a0a", surface: "#141414", surface2: "#1d1d1d", line: "#2e2e2e",
    ink: "#f0f0f0", muted: "#909090", accent: "#f0f0f0", accentHi: "#ffffff",
    onaccent: "#0a0a0a", ok: "#b8b8b8", danger: "#ff7a7a",
  }),
  make("slateblue", "Slate Blue", "dark", {
    bg: "#0c1017", surface: "#151b26", surface2: "#1d2533", line: "#2b3648",
    ink: "#e6ebf2", muted: "#8795aa", accent: "#4b86ff", accentHi: "#6c9dff",
    onaccent: "#061021",
  }),
  make("abyss", "Abyss", "dark", {
    bg: "#04100f", surface: "#0a1c1a", surface2: "#0f2725", line: "#1a3d3a",
    ink: "#dff0ee", muted: "#79a5a0", accent: "#19c4b0", accentHi: "#3ee0cb",
    onaccent: "#031412",
  }),
  make("vaporwave", "Vaporwave", "dark", {
    bg: "#140a22", surface: "#1f1035", surface2: "#2a1747", line: "#402568",
    ink: "#f2e6ff", muted: "#a68ec9", accent: "#ff5fa8", accentHi: "#ff85bd",
    onaccent: "#1a0512", ok: "#5ce1e6",
  }),
  make("matrix", "Matrix", "dark", {
    bg: "#030803", surface: "#081208", surface2: "#0d1c0d", line: "#173017",
    ink: "#c9f5c9", muted: "#5f9a5f", accent: "#33ff6a", accentHi: "#66ff92",
    onaccent: "#021006", ok: "#33ff6a",
  }),
  make("royal", "Royal", "dark", {
    bg: "#070c1c", surface: "#0e162e", surface2: "#151f40", line: "#23325e",
    ink: "#e9edfa", muted: "#8b98c2", accent: "#e8c24a", accentHi: "#f5d573",
    onaccent: "#0d0a02",
  }),
  make("dusk", "Dusk", "dark", {
    bg: "#100b16", surface: "#1a1324", surface2: "#241a32", line: "#38294c",
    ink: "#eee7f2", muted: "#a08fb0", accent: "#e0657a", accentHi: "#f08295",
    onaccent: "#170509",
  }),
  make("arctic", "Arctic", "dark", {
    bg: "#0a0f14", surface: "#121a21", surface2: "#19242e", line: "#263643",
    ink: "#e8f2f8", muted: "#8ba3b5", accent: "#8fd4f0", accentHi: "#b0e3f7",
    onaccent: "#061018",
  }),
  make("toxic", "Toxic", "dark", {
    bg: "#0a0f04", surface: "#131b09", surface2: "#1b260d", line: "#2c3d15",
    ink: "#eef5e0", muted: "#97a87d", accent: "#9ef227", accentHi: "#b6ff55",
    onaccent: "#0d1603", ok: "#9ef227",
  }),
  make("wine", "Wine", "dark", {
    bg: "#11060d", surface: "#1c0d17", surface2: "#27131f", line: "#3f1e32",
    ink: "#f3e6ee", muted: "#ab8a9d", accent: "#c14b8a", accentHi: "#d96ba5",
    onaccent: "#180410",
  }),
  make("ash", "Ash", "dark", {
    bg: "#101113", surface: "#191b1e", surface2: "#222528", line: "#33373c",
    ink: "#e7e9ec", muted: "#8f949b", accent: "#9aa7b8", accentHi: "#b6c1cf",
    onaccent: "#0d0f11",
  }),

  // ---- Light --------------------------------------------------------
  make("paper", "Paper", "light", {
    bg: "#f6f7f9", surface: "#ffffff", surface2: "#eef0f4", line: "#dbe0e8",
    ink: "#12151c", muted: "#5f6878", accent: "#5546e0", accentHi: "#4033c4",
    onaccent: "#ffffff", ok: "#0f9d63", danger: "#d83a3a",
  }),
  make("sakura", "Sakura", "light", {
    bg: "#fdf6f8", surface: "#ffffff", surface2: "#f7eaf0", line: "#ecd5e0",
    ink: "#2a1a22", muted: "#7a5f6b", accent: "#e0537f", accentHi: "#c93f6a",
    onaccent: "#ffffff", ok: "#0f9d63", danger: "#d83a3a",
  }),
  make("sandstone", "Sandstone", "light", {
    bg: "#f8f5ef", surface: "#ffffff", surface2: "#efe9df", line: "#e0d7c8",
    ink: "#1d1a14", muted: "#6b6355", accent: "#b5761f", accentHi: "#96600f",
    onaccent: "#ffffff", ok: "#0f9d63", danger: "#c9412f",
  }),
  make("mintlight", "Mint", "light", {
    bg: "#f2faf6", surface: "#ffffff", surface2: "#e5f3ec", line: "#cfe6da",
    ink: "#12211a", muted: "#587065", accent: "#12866a", accentHi: "#0c6b54",
    onaccent: "#ffffff", ok: "#12866a", danger: "#d83a3a",
  }),
  make("sky", "Sky", "light", {
    bg: "#f3f8fd", surface: "#ffffff", surface2: "#e6f0fa", line: "#cfe0f0",
    ink: "#111b26", muted: "#556a80", accent: "#1d6fd0", accentHi: "#1558ab",
    onaccent: "#ffffff", ok: "#0f9d63", danger: "#d83a3a",
  }),
  make("linen", "Linen", "light", {
    bg: "#faf8f5", surface: "#ffffff", surface2: "#f0ece6", line: "#e2dbd1",
    ink: "#1b1815", muted: "#6a6259", accent: "#3f3a34", accentHi: "#23201c",
    onaccent: "#ffffff", ok: "#0f9d63", danger: "#c9412f",
  }),
];

/** Carbon: neutral greys with a warm accent. Reads as a tool, not a toy. */
export const DEFAULT_THEME = "carbon";

export function findPalette(key: string | null | undefined) {
  return PALETTES.find((p) => p.key === key) ?? PALETTES[0];
}

const STORAGE_KEY = "app_theme";

/** Writes a palette's variables onto the root element. */
export function applyTheme(key: string | null | undefined) {
  const palette = findPalette(key);
  const root = document.documentElement;

  for (const [name, value] of Object.entries(palette.vars)) {
    root.style.setProperty(name, value);
  }

  root.dataset.themeMode = palette.mode;

  // Remembered locally so the right colours are up on the very first
  // frame, before the profile has loaded. Otherwise every app start
  // flashes the default palette.
  try {
    localStorage.setItem(STORAGE_KEY, palette.key);
  } catch {
    // Private mode or blocked storage. Not worth failing over.
  }
}

/** The last theme this machine used. Called before React renders. */
export function loadStoredTheme(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}
