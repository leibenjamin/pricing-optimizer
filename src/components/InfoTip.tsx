// src/components/InfoTip.tsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { explain } from "../lib/explain";

export type InfoTipProps = {
  /** ID key into EXPLAIN[] */
  id: string;
  /** Optional extra classes for the trigger button */
  className?: string;
  /**
   * Optional preferred alignment.
   * "right" = align left edge of tooltip with button (default)
   * "left"  = align right edge of tooltip with button
   */
  align?: "left" | "right";
  /** Allow legacy/extra props without breaking TS */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

function InfoTipImpl({ id, className, align = "right" }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Ensure we only portal after client mount (for SSR safety)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Position + viewport clamping whenever we open
  useEffect(() => {
    if (!open) return;

    const el = triggerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const margin = 8;
    const tooltipWidth = 320; // px, max width we’ll clamp to
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left =
      align === "left"
        ? rect.right - tooltipWidth
        : rect.left; // default: align left edge with trigger

    // Clamp horizontally into viewport with padding
    if (left + tooltipWidth + margin > viewportWidth) {
      left = viewportWidth - tooltipWidth - margin;
    }
    if (left < margin) left = margin;

    // Prefer placing below; if not enough space, flip above
    let top = rect.bottom + margin;
    const estimatedHeight = 180; // rough guess for clamping
    if (top + estimatedHeight > viewportHeight && rect.top > estimatedHeight + margin) {
      top = rect.top - estimatedHeight - margin;
    }

    setPos({ top, left, width: tooltipWidth });

    const handleScroll = () => setOpen(false);
    const handleResize = () => setOpen(false);

    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [open, align]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    const handleClick = (ev: MouseEvent) => {
      const target = ev.target as Node | null;
      if (
        triggerRef.current &&
        triggerRef.current.contains(target)
      ) {
        return; // let the button toggle handle it
      }
      if (popoverRef.current && popoverRef.current.contains(target)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const contentHTML = explain(id);

  const popover =
    mounted && open && pos
      ? createPortal(
          <div
            ref={popoverRef}
            className="infotip-popover fixed z-999 pointer-events-auto"
            style={{
              top: pos.top,
              left: pos.left,
              maxWidth: pos.width,
            }}
            role="tooltip"
          >
            <div className="rounded-lg shadow-xl bg-white border border-gray-200 text-xs leading-snug p-3">
              <div
                className="space-y-1"
                // content is controlled and comes from our EXPLAIN dictionary
                dangerouslySetInnerHTML={{ __html: contentHTML }}
              />
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={
          "infotip-trigger inline-flex items-center justify-center w-4 h-4 " +
          "text-[10px] rounded-full border border-gray-300 bg-white text-gray-500 " +
          "hover:bg-gray-50 hover:text-gray-700 focus:outline-none focus:ring-1 " +
          "focus:ring-blue-500 " +
          (className ?? "")
        }
        aria-label="More info"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {popover}
    </>
  );
}

export function InfoTip(props: InfoTipProps) {
  return <InfoTipImpl {...props} />;
}

export default InfoTip;
