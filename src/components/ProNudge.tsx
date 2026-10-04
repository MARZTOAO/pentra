import { Link } from "react-router-dom";
import { useFlag } from "../lib/flags";
import { useSellsProHere } from "../lib/billing";
import { ProBadge } from "./ProBadge";

/**
 * One line under a perk a free account can't use yet — frames, moving
 * backgrounds, Pro art — pointing at the upgrade page.
 *
 * Draws nothing while Pro isn't on sale: a pitch for something you
 * can't buy is just a tease — which is also why it's hidden in the
 * iPhone app outside the US App Store. Callers hide the perk's own controls for
 * non-Pro regardless; this is the only thing they see instead.
 *
 * @param what  The perk, as a plural noun: "Avatar frames".
 * @param section  Draw as a whole card (for a perk whose section is
 *   otherwise hidden) rather than a line inside one.
 */
export function ProNudge({ what, section = false }: { what: string; section?: boolean }) {
  const flag = useFlag("pro_sales");
  const sellsHere = useSellsProHere();
  if (!flag || sellsHere !== true) return null;

  const line = (
    <>
      {what} are a Pentra Pro perk.{" "}
      <Link to="/pro" className="font-semibold text-accent hover:underline">
        See what's in Pro
      </Link>
    </>
  );

  if (!section) return <p className="mt-3 text-xs text-muted">{line}</p>;

  return (
    <section className="mb-8 notch border border-line bg-surface p-5">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="label-wide text-muted">{what}</h2>
        <ProBadge />
      </div>
      <p className="text-xs text-muted">{line}</p>
    </section>
  );
}
