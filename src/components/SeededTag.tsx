import { useIsSeeded } from "../lib/seeded";

/**
 * "Seeded" beside a fake account's name — developers only (lib/seeded).
 * Draws nothing for everyone else, and nothing for real players.
 */
export function SeededTag({ userId, className = "" }: { userId: string | null | undefined; className?: string }) {
  const seeded = useIsSeeded(userId);
  if (!seeded) return null;
  return (
    <span
      title="A seeded (fake) account. Only developers see this."
      className={
        "label-wide inline-flex shrink-0 items-center border border-dashed border-muted/60 px-1.5 py-px text-[9px] text-muted " +
        className
      }
    >
      Seeded
    </span>
  );
}
