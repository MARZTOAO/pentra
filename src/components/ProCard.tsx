import type { ReactNode } from "react";

/** The PRO badge's gold, shared so every gold thing matches. */
export const PRO_GOLD =
  "linear-gradient(115deg, #ffe29a 0%, #f7b733 28%, #ff9a3c 55%, #ffd36b 100%)";

/** Text on the gold: a deep brown, not black, so it stays warm. */
export const ON_GOLD = "#2a1600";

/**
 * The card a post (and a session inside it) sits in. For a Pentra Pro
 * member it gets the gold treatment MARZ picked on 2026-10-01: design
 * A's thin gold edge all the way round, notched corners included, with
 * design C's gold strip across the top.
 *
 * The edge is drawn as a gold layer one pixel larger than the card,
 * both clipped to the same notch — a CSS border can't follow the
 * diagonal corners, a background can. The strip stops where the
 * top-right notch begins.
 *
 * Not Pro: exactly the card that was there before.
 */
export function ProCard({
  pro,
  as: Tag = "article",
  className = "",
  outerClassName = "",
  children,
}: {
  pro: boolean;
  as?: "article" | "section" | "div";
  /** Padding etc. for the card itself. */
  className?: string;
  /** Margins for the whole thing. */
  outerClassName?: string;
  children: ReactNode;
}) {
  if (!pro) {
    return (
      <Tag className={`notch border border-line bg-surface ${className} ${outerClassName}`}>
        {children}
      </Tag>
    );
  }

  return (
    <Tag className={`relative notch p-px ${outerClassName}`} style={{ background: PRO_GOLD }}>
      <div className={`notch bg-surface ${className}`}>{children}</div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 right-4 top-0 h-[3px]"
        style={{ background: PRO_GOLD }}
      />
    </Tag>
  );
}
