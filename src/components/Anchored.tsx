import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

/**
 * A panel that hangs off a trigger — a dropdown, a picker, a menu.
 *
 * It renders into <body> rather than next to its trigger, and that is the
 * whole point of it. EDGE panels are notched, and `clip-path` clips every
 * descendant, including `position: fixed` ones. So a dropdown rendered
 * inside a notched panel gets cut off at that panel's edge: the avatar and
 * background pickers simply appeared not to open at all.
 *
 * Portalling puts the panel outside the notched tree entirely, where
 * nothing can clip it. The cost is that it's no longer a DOM descendant of
 * its trigger, so a naive "did you click outside the wrapper?" check would
 * treat every click INSIDE the panel as an outside click and close it
 * instantly. That's why this component owns the dismiss logic: it checks
 * the trigger and the panel, and callers don't write that code at all.
 *
 * Position is recomputed on scroll and resize — `fixed` is relative to the
 * viewport, so without that the panel would detach and float as the page
 * moves under it.
 */
export function Anchored({
  anchorRef,
  onClose,
  width,
  align = "left",
  children,
}: {
  /** The trigger to hang from. */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Pixels. Needed up front so the panel can be kept on screen. */
  width: number;
  /** Which edge to line up with the trigger. */
  align?: "left" | "right";
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    function place() {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const wanted = align === "right" ? rect.right - width : rect.left;

      // Never let it hang off the side of the window; an 8px margin keeps
      // it from looking wedged against the edge.
      const left = Math.max(
        8,
        Math.min(wanted, window.innerWidth - width - 8),
      );

      setPos({ top: rect.bottom + 8, left });
    }

    place();

    window.addEventListener("resize", place);
    // Capture phase: the scroll may happen in any ancestor, not just window.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, align, width]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (panel.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={panel}
      className="float-shadow z-50"
      style={{
        position: "fixed",
        width,
        // Parked off-screen for the first paint, before we've measured.
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
