import { bannerStyle } from "../lib/backgrounds";
import { MotionBackground } from "./MotionBackground";

/**
 * Pentra's own background — Cipher, the orange digit rain — behind
 * the main screens, for everyone. Not a Pro perk here: it's the house
 * look. (Choosing Cipher for your OWN profile is still Pro.)
 *
 * Drawn once by AppShell, not by each page, so it's there while a
 * screen is still loading and nothing on the page can drag it along:
 * it sits outside <main>, whose `rise` animation would otherwise make
 * a fixed layer scroll with the page while it plays (see index.css).
 *
 * Profiles aren't in the list on purpose — they show the player's own
 * background.
 */

/** A key in lib/backgrounds.ts. */
export const HOUSE_BACKGROUND = "motion-cipher";

/** Screens that get it. `/messages` covers `/messages/:id` too. */
const PAGES = ["/home", "/sessions", "/friends", "/messages", "/settings"];

export function usesHouseBackground(path: string): boolean {
  return PAGES.some((p) => path === p || path.startsWith(p + "/"));
}

/**
 * Two fixed layers filling the window: the art, then a 45% scrim so
 * text stays readable (the same as the profile pages). Holds still for
 * reduced motion.
 */
export function HouseBackground() {
  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 -z-20"
        style={bannerStyle({ background: HOUSE_BACKGROUND })}
        aria-hidden="true"
      >
        <MotionBackground preset={HOUSE_BACKGROUND} />
      </div>
      <div className="pointer-events-none fixed inset-0 -z-10 bg-bg/45" aria-hidden="true" />
    </>
  );
}
