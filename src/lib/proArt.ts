/**
 * Pentra Pro artwork: avatars and backgrounds MARZ made (2026-10-01).
 *
 * The images ship inside the app, in public/pro/ — compressed copies of
 * the originals he keeps in pro-art/ (which is not in git). Each has a
 * full version and a small `.thumb` for pickers and small avatars:
 *
 *   avatars      512x512 WebP (~35 KB),  thumb 128x128 (~3 KB)
 *   backgrounds  2560 wide WebP (~320 KB), thumb 384 wide (~10 KB)
 *
 * Stored on the profile as:
 *   avatar_preset  "pro.<key>"   e.g. "pro.alien-1"
 *   background     "pro-<key>"   e.g. "pro-cosmic-1"
 *
 * Both are Pro only; the database refuses them without Pro and clears
 * them when Pro lapses (supabase/83). Adding more art: compress it into
 * public/pro/ and add a line here — no migration, the prefix is the rule.
 */

export type ProAvatar = { key: string; label: string };

export const PRO_AVATARS: ProAvatar[] = [
  { key: "alien-1", label: "Alien 1" },
  { key: "alien-2", label: "Alien 2" },
  { key: "alien-3", label: "Alien 3" },
  { key: "alien-4", label: "Alien 4" },
  { key: "alien-5", label: "Alien 5" },
  { key: "alien-6", label: "Alien 6" },
  { key: "alien-7", label: "Alien 7" },
  { key: "alien-8", label: "Alien 8" },
  { key: "cookoo", label: "Cookoo" },
  { key: "dragon-1", label: "Dragon 1" },
  { key: "dragon-2", label: "Dragon 2" },
  { key: "dragon-3", label: "Dragon 3" },
  { key: "dragon-4", label: "Dragon 4" },
  { key: "egyptian-1", label: "Egyptian 1" },
  { key: "egyptian-2", label: "Egyptian 2" },
  { key: "egyptian-3", label: "Egyptian 3" },
  { key: "egyptian-4", label: "Egyptian 4" },
  { key: "foxy", label: "Foxy" },
  { key: "future-soldier-1", label: "Future Soldier 1" },
  { key: "future-soldier-2", label: "Future Soldier 2" },
  { key: "future-soldier-3", label: "Future Soldier 3" },
  { key: "future-soldier-4", label: "Future Soldier 4" },
  { key: "future-soldier-5", label: "Future Soldier 5" },
  { key: "future-soldier-6", label: "Future Soldier 6" },
  { key: "future-soldier-7", label: "Future Soldier 7" },
  { key: "future-soldier-8", label: "Future Soldier 8" },
  { key: "future-soldier-9", label: "Future Soldier 9" },
  { key: "greek-1", label: "Greek 1" },
  { key: "greek-2", label: "Greek 2" },
  { key: "greek-3", label: "Greek 3" },
  { key: "greek-4", label: "Greek 4" },
  { key: "griffon", label: "Griffon" },
  { key: "hoo", label: "HOO" },
  { key: "kade", label: "Kade" },
  { key: "lance", label: "Lance" },
  { key: "norse-1", label: "Norse 1" },
  { key: "norse-2", label: "Norse 2" },
  { key: "norse-3", label: "Norse 3" },
  { key: "norse-4", label: "Norse 4" },
  { key: "pirate-1", label: "Pirate 1" },
  { key: "pirate-2", label: "Pirate 2" },
  { key: "pirate-3", label: "Pirate 3" },
  { key: "pirate-4", label: "Pirate 4" },
  { key: "prairie", label: "Prairie" },
  { key: "sirribbit", label: "Sirribbit" },
  { key: "soldier-1", label: "Soldier 1" },
  { key: "soldier-2", label: "Soldier 2" },
  { key: "soldier-3", label: "Soldier 3" },
  { key: "soldier-4", label: "Soldier 4" },
  { key: "tombstone", label: "Tombstone" },
];

export const PRO_AVATAR_PREFIX = "pro.";

/** The Pro avatar a preset names, or null if it isn't one. */
export function proAvatarOf(preset: string | null | undefined): ProAvatar | null {
  if (!preset || !preset.startsWith(PRO_AVATAR_PREFIX)) return null;
  const key = preset.slice(PRO_AVATAR_PREFIX.length);
  return PRO_AVATARS.find((a) => a.key === key) ?? null;
}

export function proAvatarPreset(key: string): string {
  return PRO_AVATAR_PREFIX + key;
}

/** Thumb for anything drawn at 56px or less; the full one above that. */
export function proAvatarUrl(key: string, size = 96): string {
  return size <= 56 ? `/pro/avatars/${key}.thumb.webp` : `/pro/avatars/${key}.webp`;
}

/** `color` is the image's average, shown while it loads. */
export type ProBackgroundArt = { key: string; label: string; color: string };

export const PRO_BACKGROUND_ART: ProBackgroundArt[] = [
  { key: "cosmic-1", label: "Cosmic 1", color: "#3c3537" },
  { key: "cosmic-2", label: "Cosmic 2", color: "#30100e" },
  { key: "cosmic-3", label: "Cosmic 3", color: "#2b2928" },
  { key: "cosmic-4", label: "Cosmic 4", color: "#0f333f" },
  { key: "creator-1", label: "Creator 1", color: "#716d4d" },
  { key: "creator-2", label: "Creator 2", color: "#696657" },
  { key: "cybertech-1", label: "Cybertech 1", color: "#251948" },
  { key: "cybertech-2", label: "Cybertech 2", color: "#230b22" },
  { key: "cybertech-3", label: "Cybertech 3", color: "#2b0f34" },
  { key: "cybertech-4", label: "Cybertech 4", color: "#3b1f3a" },
  { key: "dynasty-1", label: "Dynasty 1", color: "#57615b" },
  { key: "dynasty-2", label: "Dynasty 2", color: "#6f6b63" },
  { key: "dynasty-3", label: "Dynasty 3", color: "#68695d" },
  { key: "dynasty-4", label: "Dynasty 4", color: "#6b7676" },
  { key: "dynasty-5", label: "Dynasty 5", color: "#7c7977" },
  { key: "dynasty-6", label: "Dynasty 6", color: "#6d756e" },
  { key: "dynasty-7", label: "Dynasty 7", color: "#716c63" },
  { key: "dynasty-8", label: "Dynasty 8", color: "#6c726a" },
  { key: "egyptian-1", label: "Egyptian 1", color: "#7a7465" },
  { key: "egyptian-2", label: "Egyptian 2", color: "#81756a" },
  { key: "egyptian-3", label: "Egyptian 3", color: "#877f77" },
  { key: "egyptian-4", label: "Egyptian 4", color: "#81756a" },
  { key: "fantasy-siege-1", label: "Fantasy Siege 1", color: "#556669" },
  { key: "fantasy-siege-2", label: "Fantasy Siege 2", color: "#565b5d" },
  { key: "fantasy-siege-3", label: "Fantasy Siege 3", color: "#47453e" },
  { key: "fantasy-siege-4", label: "Fantasy Siege 4", color: "#5a6668" },
  { key: "pentra-maze", label: "Pentra Maze", color: "#818181" },
  { key: "solar-rising-1", label: "Solar Rising 1", color: "#7e5942" },
  { key: "solar-rising-2", label: "Solar Rising 2", color: "#683c29" },
  { key: "solar-rising-3", label: "Solar Rising 3", color: "#70514b" },
  { key: "solar-rising-4", label: "Solar Rising 4", color: "#7d523c" },
  { key: "solar-setting-1", label: "Solar Setting 1", color: "#7d583c" },
  { key: "solar-setting-2", label: "Solar Setting 2", color: "#633e34" },
  { key: "solar-setting-3", label: "Solar Setting 3", color: "#623d28" },
  { key: "solar-setting-4", label: "Solar Setting 4", color: "#5d4433" },
  { key: "solar-setting-5", label: "Solar Setting 5", color: "#58392b" },
  { key: "valhalla-1", label: "Valhalla 1", color: "#61757a" },
  { key: "valhalla-2", label: "Valhalla 2", color: "#4e595d" },
  { key: "valhalla-3", label: "Valhalla 3", color: "#4d6467" },
  { key: "valhalla-4", label: "Valhalla 4", color: "#586360" },
];
