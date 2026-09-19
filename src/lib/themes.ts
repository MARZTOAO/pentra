/**
 * Carbon — the app's palette. There is only one, and that's the point.
 *
 * This file used to hold twenty-four. They went because a brand can't
 * live in a colour every user can change: when any surface might be any
 * colour, colour stops meaning anything. Xbox is green, PlayStation is
 * that blue, Steam is slate — one look each, non-negotiable. Identity
 * moved to the things users don't reach: the typefaces, the notched
 * corner, the density, how numbers are set (see index.css).
 *
 * What users CAN still change is their own profile — background, banner,
 * avatar. Personal expression inside a fixed house style, which is the
 * bargain Discord and Steam both make.
 *
 * The shape of this module is unchanged on purpose, so the rest of the
 * app carries on calling applyTheme() without caring that there's now
 * one option. It also leaves the door open: adding a second palette
 * later means adding it to PALETTES, nothing else.
 *
 * `onaccent` is the text colour that sits ON a filled accent button.
 * It exists because hardcoding white breaks the moment an accent is
 * pale — white on white is an invisible button.
 */

export type Palette = {
  key: string;
  label: string;
  mode: "dark" | "light";
  swatch: [string, string, string];
  vars: Record<string, string>;
};

export const CARBON: Palette = {
  key: "carbon",
  label: "Carbon",
  mode: "dark",
  swatch: ["#0e0f11", "#1f2227", "#ff7a2f"],
  vars: {
    "--color-bg": "#0e0f11",
    "--color-surface": "#17191d",
    "--color-surface-2": "#1f2227",
    "--color-line": "#2e3239",
    "--color-ink": "#e9ebee",
    "--color-muted": "#8d939c",
    "--color-accent": "#ff7a2f",
    "--color-accent-hi": "#ff9354",
    "--color-onaccent": "#1a0d04",
    "--color-accent-dim": "#2b1a0e",
    "--color-accent-edge": "#4a2d16",
    "--color-ok": "#4ed07a",
    "--color-danger": "#ff6b6b",
  },
};

export const PALETTES: Palette[] = [CARBON];

export const DEFAULT_THEME = CARBON.key;

export function findPalette(_key?: string | null): Palette {
  return CARBON;
}

/**
 * Writes the palette onto the root element.
 *
 * Still runs even with one palette: index.css declares the same values
 * as static tokens so the first frame is right, and this keeps them in
 * step if a second palette ever arrives. Cheap, and it means no caller
 * has to change.
 */
export function applyTheme(_key?: string | null) {
  const root = document.documentElement;

  for (const [name, value] of Object.entries(CARBON.vars)) {
    root.style.setProperty(name, value);
  }

  root.dataset.themeMode = CARBON.mode;
}

/** Kept so existing callers still work. Always Carbon. */
export function loadStoredTheme(): string {
  return DEFAULT_THEME;
}
