import type { ReactNode } from "react";

/**
 * Premade avatars.
 *
 * Drawn as SVG rather than shipped as image files: nothing to host, no
 * licensing, sharp at any size, and a 3 KB file instead of a folder of
 * PNGs. Same reasoning as the gradient backgrounds.
 *
 * A preset is a symbol plus a colour — "bolt.ember" — which turns 32
 * symbols and 6 colours into 192 avatars from 38 buttons.
 */

export type AvatarShape = { key: string; label: string; glyph: ReactNode };
export type AvatarColor = { key: string; label: string; bg: string; fg: string };

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const AVATAR_SHAPES: AvatarShape[] = [
  {
    key: "bolt", label: "Bolt",
    glyph: <path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12z" {...S} />,
  },
  {
    key: "star", label: "Star",
    glyph: <path d="m12 3.5 2.6 5.5 6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.4 9.9l6-.9z" {...S} />,
  },
  {
    key: "heart", label: "Heart",
    glyph: <path d="M12 20s-6.8-4.3-6.8-9A3.9 3.9 0 0 1 12 8.4a3.9 3.9 0 0 1 6.8 2.6c0 4.7-6.8 9-6.8 9z" {...S} />,
  },
  {
    key: "shield", label: "Shield",
    glyph: <path d="M12 3.5 19 6.3v4.8c0 4.3-2.9 7.9-7 9.4-4.1-1.5-7-5.1-7-9.4V6.3z" {...S} />,
  },
  {
    key: "dpad", label: "D-Pad",
    glyph: <path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z" {...S} />,
  },
  {
    key: "target", label: "Target",
    glyph: (
      <>
        <circle cx="12" cy="12" r="8" {...S} />
        <circle cx="12" cy="12" r="4.4" {...S} />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    key: "ghost", label: "Ghost",
    glyph: (
      <>
        <path d="M5.5 20.5V11a6.5 6.5 0 0 1 13 0v9.5l-2.6-2-2.2 2-1.7-2-1.7 2-2.2-2z" {...S} />
        <circle cx="9.8" cy="11" r="1" fill="currentColor" stroke="none" />
        <circle cx="14.2" cy="11" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    key: "skull", label: "Skull",
    glyph: (
      <>
        <path d="M6 11.5a6 6 0 1 1 12 0c0 2-.9 3.3-2 4v2.8H8V15.5c-1.1-.7-2-2-2-4z" {...S} />
        <circle cx="9.6" cy="11.4" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="14.4" cy="11.4" r="1.4" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    key: "rocket", label: "Rocket",
    glyph: (
      <>
        <path d="M12 3.2c2.9 2.2 4.6 5.5 4.6 9l-4.6 2.8-4.6-2.8c0-3.5 1.7-6.8 4.6-9z" {...S} />
        <path d="M7.4 12.2 5 14.6v3l2.6-1.3M16.6 12.2 19 14.6v3l-2.6-1.3" {...S} />
        <circle cx="12" cy="9" r="1.7" {...S} />
      </>
    ),
  },
  {
    key: "crown", label: "Crown",
    glyph: <path d="M4 17.5 3 7.5l5 3.2L12 5l4 5.7 5-3.2-1 10z" {...S} />,
  },
  {
    key: "gem", label: "Gem",
    glyph: (
      <>
        <path d="m12 4 6.5 4.2v7.6L12 20l-6.5-4.2V8.2z" {...S} />
        <path d="M5.8 8.4 12 11.6l6.2-3.2M12 11.6V20" {...S} />
      </>
    ),
  },
  {
    key: "flame", label: "Flame",
    glyph: <path d="M12 3.5c.6 3 3.2 4 4.5 6.4a5.8 5.8 0 0 1-4.5 10 5.8 5.8 0 0 1-4.5-10c.5 1 1.3 1.6 2.2 1.8-.6-3 1.3-6 2.3-8.2z" {...S} />,
  },
  {
    key: "robot", label: "Robot",
    glyph: (
      <>
        <rect x="5" y="8" width="14" height="11" rx="3" {...S} />
        <path d="M12 8V4.5M9 4.5h6" {...S} />
        <circle cx="9.5" cy="13" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="13" r="1.3" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    key: "cat", label: "Cat",
    glyph: (
      <>
        <path d="M5.5 9.5 5 4.8l4.2 2.6a8 8 0 0 1 5.6 0L19 4.8l-.5 4.7" {...S} />
        <path d="M5.5 12.5a6.5 6.5 0 0 0 13 0" {...S} />
        <circle cx="9.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    key: "alien", label: "Alien",
    glyph: (
      <>
        <path d="M12 4c4.2 0 7 3 7 6.8 0 4.4-3.6 8.2-7 9.2-3.4-1-7-4.8-7-9.2C5 7 7.8 4 12 4z" {...S} />
        <path d="M8 10.5c1.4 0 2.6 1 2.6 2.3-1.4.4-2.9-.6-2.6-2.3zM16 10.5c-1.4 0-2.6 1-2.6 2.3 1.4.4 2.9-.6 2.6-2.3z" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    key: "mushroom", label: "Mushroom",
    glyph: (
      <>
        <path d="M4.5 12a7.5 7.5 0 0 1 15 0z" {...S} />
        <path d="M9.5 12v5a2.5 2.5 0 0 0 5 0v-5" {...S} />
      </>
    ),
  },
  {
    key: "sword", label: "Sword",
    glyph: (
      <>
        <path d="M12 2.5 14.2 7v8.5H9.8V7z" {...S} />
        <path d="M8 15.5h8M12 15.5v3.5" {...S} />
        <circle cx="12" cy="20.2" r="1.3" {...S} />
      </>
    ),
  },
  {
    key: "axe", label: "Axe",
    glyph: (
      <>
        <path d="M12.8 6.2c2.5-2 5.6-1.6 7.2 1-2.1 2.6-5.2 3.1-7.8 1.4z" {...S} />
        <path d="M11.4 8.4 6.8 20.5" {...S} />
      </>
    ),
  },
  {
    key: "bow", label: "Bow",
    glyph: (
      <>
        <path d="M7.5 3.5a11.5 11.5 0 0 1 0 17" {...S} />
        <path d="M7.5 3.5v17" {...S} />
        <path d="M6 12h11.5M14.5 9l3 3-3 3" {...S} />
      </>
    ),
  },
  {
    key: "potion", label: "Potion",
    glyph: (
      <>
        <path d="M10 3h4v3.2l3.4 6.3a5.4 5.4 0 1 1-10.8 0L10 6.2z" {...S} />
        <path d="M6.9 14.5h10.2" {...S} />
      </>
    ),
  },
  {
    key: "key", label: "Key",
    glyph: (
      <>
        <circle cx="8.5" cy="15.5" r="3.6" {...S} />
        <path d="M11.2 13 19 5.2M15.8 8.4l2.1 2.1M18 6.2l2.1 2.1" {...S} />
      </>
    ),
  },
  {
    key: "dice", label: "Dice",
    glyph: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="3.5" {...S} />
        <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    key: "trophy", label: "Trophy",
    glyph: (
      <>
        <path d="M8 4h8v5a4 4 0 0 1-8 0z" {...S} />
        <path d="M8 5.6H5.8A2.6 2.6 0 0 0 8.4 9.8M16 5.6h2.2a2.6 2.6 0 0 1-2.6 4.2" {...S} />
        <path d="M12 13v3.4M8.8 19.5h6.4" {...S} />
      </>
    ),
  },
  {
    key: "headphones", label: "Headphones",
    glyph: (
      <>
        <path d="M5 14.5v-2.2a7 7 0 0 1 14 0v2.2" {...S} />
        <rect x="3" y="13.5" width="3.4" height="6.4" rx="1.7" {...S} />
        <rect x="17.6" y="13.5" width="3.4" height="6.4" rx="1.7" {...S} />
      </>
    ),
  },
  {
    key: "gamepad", label: "Gamepad",
    glyph: (
      <>
        <path d="M7.5 8h9a5 5 0 0 1 4.4 7.3l-1 2a2.3 2.3 0 0 1-4-.3L14.8 15H9.2l-1.1 2a2.3 2.3 0 0 1-4 .3l-1-2A5 5 0 0 1 7.5 8z" {...S} />
        <path d="M7 11.5h2.4M8.2 10.3v2.4" {...S} />
        <circle cx="15.4" cy="11.2" r="1" fill="currentColor" stroke="none" />
        <circle cx="17.4" cy="12.8" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    key: "chip", label: "Chip",
    glyph: (
      <>
        <rect x="7" y="7" width="10" height="10" rx="2" {...S} />
        <path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3" {...S} />
      </>
    ),
  },
  {
    key: "eye", label: "Eye",
    glyph: (
      <>
        <path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12z" {...S} />
        <circle cx="12" cy="12" r="3" {...S} />
      </>
    ),
  },
  {
    key: "moon", label: "Moon",
    glyph: <path d="M20 14.6A8.6 8.6 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6z" {...S} />,
  },
  {
    key: "sun", label: "Sun",
    glyph: (
      <>
        <circle cx="12" cy="12" r="4" {...S} />
        <path d="M12 2.4v2.4M12 19.2v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.4 12h2.4M19.2 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" {...S} />
      </>
    ),
  },
  {
    key: "leaf", label: "Leaf",
    glyph: (
      <>
        <path d="M20 4c0 9-6 13.2-11 13.2A5 5 0 0 1 4 12.2C4 7 12 4 20 4z" {...S} />
        <path d="M4.5 20C8 14.5 13 10.5 18 8.5" {...S} />
      </>
    ),
  },
  {
    key: "wave", label: "Wave",
    glyph: <path d="M3 9.5c2.4-3 4.8-3 7.2 0s4.8 3 7.2 0M3 15.5c2.4-3 4.8-3 7.2 0s4.8 3 7.2 0" {...S} />,
  },
  {
    key: "paw", label: "Paw",
    glyph: (
      <>
        <circle cx="7.4" cy="10.4" r="1.9" {...S} />
        <circle cx="10.6" cy="7.6" r="1.9" {...S} />
        <circle cx="14.4" cy="7.6" r="1.9" {...S} />
        <circle cx="17.2" cy="10.4" r="1.9" {...S} />
        <path d="M12.3 13.2c2.9 0 5 1.9 5 4.1s-2.2 3.6-5 3.6-5-1.5-5-3.6 2.1-4.1 5-4.1z" {...S} />
      </>
    ),
  },

  // ----------------------------------------------------------------
  // Emblems.
  //
  // Heavier than the line glyphs above: solid silhouettes with a
  // 22%-opacity facet behind them for depth, so they read as artwork
  // rather than as icons. Drawn to survive 32px in a friends list,
  // which is what killed the first attempt at these — literal animal
  // portraits turn to mush at that size, so these are heraldic and
  // geometric instead. All original; none traces anyone else's mark.
  // ----------------------------------------------------------------
  {
    key: "blades", label: "Crossed blades",
    glyph: (
      <>
        <path d="M5 19 18 5M19 19 6 5" stroke="currentColor" strokeWidth="4.4" strokeLinecap="round" opacity=".22"/>
        <path d="M6.4 18.2 17 5.6M17.6 18.2 7 5.6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
        <path d="M4.6 17.2 7.2 19.8M19.4 17.2 16.8 19.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      </>
    ),
  },
  {
    key: "chevron", label: "Chevrons",
    glyph: (
      <>
        <path d="m5 10.6 7-5.2 7 5.2M5 15.6l7-5.2 7 5.2M5 20.2l7-5.2 7 5.2" fill="none" stroke="currentColor" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" opacity=".22"/>
        <path d="m5 10.6 7-5.2 7 5.2M5 15.6l7-5.2 7 5.2M5 20.2l7-5.2 7 5.2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      </>
    ),
  },
  {
    key: "trident", label: "Trident",
    glyph: (
      <>
        <path d="M12 4.2v16M6.6 7.4v2.4a5.4 5.4 0 0 0 10.8 0V7.4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
        <path d="m6.6 7.4-1.4 2.2M17.4 7.4l1.4 2.2M12 4.2l-1.8 2.4M12 4.2l1.8 2.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M9 19.4h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
      </>
    ),
  },
  {
    key: "circuit", label: "Circuit",
    glyph: (
      <>
        <path d="M12 5.4v3.8m0 5.6v3.8M5.4 12h3.8m5.6 0h3.8M8 8l2.2 2.2m3.6 3.6L16 16M16 8l-2.2 2.2m-3.6 3.6L8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="12" cy="12" r="3" fill="currentColor"/>
        <circle cx="12" cy="12" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.6" opacity=".45"/>
      </>
    ),
  },
  {
    key: "core", label: "Core",
    glyph: (
      <>
        <circle cx="12" cy="12" r="3.4" fill="currentColor"/>
        <ellipse cx="12" cy="12" rx="8.4" ry="3.6" fill="none" stroke="currentColor" strokeWidth="1.9"/>
        <ellipse cx="12" cy="12" rx="8.4" ry="3.6" fill="none" stroke="currentColor" strokeWidth="1.9" transform="rotate(60 12 12)"/>
        <ellipse cx="12" cy="12" rx="8.4" ry="3.6" fill="none" stroke="currentColor" strokeWidth="1.9" transform="rotate(-60 12 12)"/>
      </>
    ),
  },
  {
    key: "comet", label: "Comet",
    glyph: (
      <>
        <circle cx="15.6" cy="8.4" r="3.8" fill="currentColor"/>
        <path d="M12.4 11.6 4 20M11.4 8.8 4.6 11.4M15 13.2l-2.4 6.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      </>
    ),
  },
  {
    key: "compass", label: "Compass",
    glyph: (
      <>
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2"/>
        <path d="m12 4.4 2.2 5.4 5.4 2.2-5.4 2.2-2.2 5.4-2.2-5.4L4.4 12l5.4-2.2z" fill="currentColor"/>
      </>
    ),
  },
  {
    key: "hourglass", label: "Hourglass",
    glyph: (
      <>
        <path d="M6.4 4.4h11.2L12.6 12l5 7.6H6.4l5-7.6z" fill="currentColor"/>
        <path d="M5.4 4.4h13.2M5.4 19.6h13.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
      </>
    ),
  },
  {
    key: "kraken", label: "Kraken",
    glyph: (
      <>
        <circle cx="12" cy="8.6" r="4.4" fill="currentColor"/>
        <path d="M7.8 12.6c-1.6 3-3.2 4.2-4.8 4.8M10.2 14c-.9 3.6-1.8 5-2.9 6.2M13.8 14c.9 3.6 1.8 5 2.9 6.2M16.2 12.6c1.6 3 3.2 4.2 4.8 4.8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"/>
        <path d="M10.3 8.1h1.2M12.5 8.1h1.2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity=".9"/>
      </>
    ),
  },
  {
    key: "eclipse", label: "Eclipse",
    glyph: (
      <>
        <path d="M15.4 3.8a8.6 8.6 0 1 0 0 16.4 8.8 8.8 0 0 1 0-16.4z" fill="currentColor"/>
        <circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" strokeWidth="1.8" opacity=".45"/>
      </>
    ),
  },
  {
    key: "anvil", label: "Anvil",
    glyph: (
      <>
        <path d="M4.6 8.4h14.8L17 11.8h1.4l-1.6 5H7.2l-1.6-5H7z" fill="currentColor"/>
        <path d="M8.6 19.4h6.8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/>
      </>
    ),
  },
  {
    key: "fang", label: "Fang",
    glyph: (
      <>
        <path d="M5 4h14l-2.4 7.4L12 21 7.4 11.4z" fill="currentColor" opacity=".22"/>
        <path d="M6.6 5.4h10.8l-2 6.4L12 18.8l-3.4-7z" fill="currentColor"/>
        <path d="M12 9.6v5.4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" opacity=".85"/>
      </>
    ),
  },
  {
    key: "horns", label: "Horns",
    glyph: (
      <>
        <path d="M4.2 4.4c-.6 5.2 1.4 8.2 4.4 9.6M19.8 4.4c.6 5.2-1.4 8.2-4.4 9.6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/>
        <path d="M8.2 13.6h7.6l-1.4 5.8H9.6z" fill="currentColor"/>
      </>
    ),
  },
  {
    key: "claw", label: "Claw",
    glyph: (
      <>
        <path d="M5.4 3.6c1.2 6.4 2 10.4 2.8 15.8M10.4 3c.5 6.6.7 10.8.8 16.4M16.2 3.6c-.6 6.5-1.2 10.6-2 16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
        <path d="M4.6 19.8h15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity=".5"/>
      </>
    ),
  },
  {
    key: "wing", label: "Wings",
    glyph: (
      <>
        <path d="M3 8.4c4.4-.6 7.4.8 9 4.2 1.6-3.4 4.6-4.8 9-4.2-2 1.6-2.8 3.2-3 5.2-2.2-1-4.2-.6-6 1.6-1.8-2.2-3.8-2.6-6-1.6-.2-2-1-3.6-3-5.2z" fill="currentColor"/>
        <path d="M12 15.4v4.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      </>
    ),
  },
  {
    key: "bastion", label: "Bastion",
    glyph: (
      <>
        <path d="M4 4h4v2h3V4h2v2h3V4h4v8.4c0 4.4-3.6 7-8 8.6-4.4-1.6-8-4.2-8-8.6z" fill="currentColor" opacity=".22"/>
        <path d="M5.4 5.4h3v2h2.2v-2h2.8v2H16v-2h2.6v7c0 3.6-3 5.8-6.6 7.2-3.6-1.4-6.6-3.6-6.6-7.2z" fill="currentColor"/>
      </>
    ),
  },
  {
    key: "crosshair", label: "Crosshair",
    glyph: (
      <>
        <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="2.2"/>
        <path d="M12 2.4v5M12 16.6v5M2.4 12h5M16.6 12h5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
        <circle cx="12" cy="12" r="2.2" fill="currentColor"/>
      </>
    ),
  },
  {
    key: "rift", label: "Rift",
    glyph: (
      <>
        <path d="M13.2 2.8 10 9.4l3.4 2.2-4.6 9.6 1.2-7.6-3.2-1.8z" fill="currentColor"/>
        <path d="M17.6 5.6 19.8 4M18.6 12.4l2.4.6M5.4 6.2 3.2 4.8M4.8 13.2l-2.2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".5"/>
      </>
    ),
  },
  {
    key: "pylon", label: "Pylon",
    glyph: (
      <>
        <path d="M12 3.2 18.4 20H5.6z" fill="currentColor" opacity=".22"/>
        <path d="M12 5.4 16.8 18.6H7.2z" fill="currentColor"/>
        <path d="M9.4 14.2h5.2" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" opacity=".85"/>
      </>
    ),
  },
  {
    key: "sawblade", label: "Sawblade",
    glyph: (
      <>
        <path d="M12 3.4l1.9 2 2.7-.6.4 2.7 2.4 1.3-1.3 2.4 1.3 2.4-2.4 1.3-.4 2.7-2.7-.6-1.9 2-1.9-2-2.7.6-.4-2.7-2.4-1.3 1.3-2.4-1.3-2.4 2.4-1.3.4-2.7 2.7.6z" fill="currentColor"/>
        <circle cx="12" cy="12" r="2.6" fill="#fff" opacity=".9"/>
      </>
    ),
  },
  {
    key: "vortex", label: "Vortex",
    glyph: (
      <>
        <path d="M12 4a8 8 0 1 1-8 8c0-3.4 2.6-6 6-6s5 2.2 5 4.6-1.8 3.8-3.6 3.8-3-1.2-3-2.8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
      </>
    ),
  },
  {
    key: "monolith", label: "Monolith",
    glyph: (
      <>
        <path d="M7.4 4.4h9.2v15.2H7.4z" fill="currentColor"/>
        <path d="M12 7.4v9.2" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".85"/>
      </>
    ),
  },
  {
    key: "beacon", label: "Beacon",
    glyph: (
      <>
        <path d="M12 3.4 15 9h-6z" fill="currentColor"/>
        <path d="M12 9.4v7.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
        <path d="M6.6 20.2h10.8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/>
        <path d="M5.4 12.4 3 11M18.6 12.4 21 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".55"/>
      </>
    ),
  },
  {
    key: "prism", label: "Prism",
    glyph: (
      <>
        <path d="M12 3.6 20.4 18H3.6z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/>
        <path d="M12 3.6V18M12 10.8l5.4 7.2M12 10.8 6.6 18" stroke="currentColor" strokeWidth="1.7" opacity=".5"/>
      </>
    ),
  },
];

export const AVATAR_COLORS: AvatarColor[] = [
  { key: "ember", label: "Ember", bg: "linear-gradient(135deg,#7a2f18,#ff8b3d)", fg: "#1a0d04" },
  { key: "violet", label: "Violet", bg: "linear-gradient(135deg,#3b1d6e,#9b7bff)", fg: "#12081f" },
  { key: "teal", label: "Teal", bg: "linear-gradient(135deg,#0f4a4a,#41cfc0)", fg: "#04161a" },
  { key: "rose", label: "Rose", bg: "linear-gradient(135deg,#7a1f3d,#ff7aa2)", fg: "#1c0610" },
  { key: "lime", label: "Lime", bg: "linear-gradient(135deg,#2f5c12,#a8e84a)", fg: "#0d1604" },
  { key: "slate", label: "Slate", bg: "linear-gradient(135deg,#2a3040,#8a97ad)", fg: "#0b0e14" },
];

/** "bolt.ember" -> the shape and colour it names. */
export function parsePreset(preset: string | null | undefined) {
  if (!preset) return null;

  const [shapeKey, colorKey] = preset.split(".");
  const shape = AVATAR_SHAPES.find((s) => s.key === shapeKey);
  const color = AVATAR_COLORS.find((c) => c.key === colorKey);

  if (!shape || !color) return null;
  return { shape, color };
}

export function makePreset(shapeKey: string, colorKey: string) {
  return `${shapeKey}.${colorKey}`;
}
