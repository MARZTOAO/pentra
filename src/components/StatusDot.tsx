import { PRESENCE_COLOR, PRESENCE_LABEL, type PresenceState } from "../lib/presence";

/**
 * The presence dot, in one place.
 *
 * Offline is drawn as a ring rather than a filled circle. Three states
 * told apart by hue alone would be invisible to the eight percent of
 * men with a colour vision deficiency — and this is an app for gamers,
 * so that is not a rounding error. Filled versus hollow carries the
 * "here or not" distinction without colour, and the title attribute
 * carries it in words.
 */
export function StatusDot({
  state,
  size = 10,
  className = "",
}: {
  state: PresenceState;
  size?: number;
  className?: string;
}) {
  const colour = PRESENCE_COLOR[state];
  const hollow = state === "offline";

  return (
    <span
      role="img"
      aria-label={PRESENCE_LABEL[state]}
      title={PRESENCE_LABEL[state]}
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: hollow ? "transparent" : colour,
        border: hollow ? `1.5px solid ${colour}` : "none",
      }}
    />
  );
}
