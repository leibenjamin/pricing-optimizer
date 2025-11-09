// src/components/Modal.tsx
import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  /** Max width of the panel */
  size?: "sm" | "md" | "lg" | "xl";
};

const WIDTH: Record<NonNullable<Props["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
};

/** Focusable elements inside a container */
function getFocusable(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(nodes).filter((n) => !n.hasAttribute("disabled"));
}

export default function Modal({
  open,
  title,
  children,
  footer,
  onClose,
  size = "lg",
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const root = dialogRef.current;
    if (!root) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = getFocusable(root);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    root.addEventListener("keydown", onKeyDown);
    firstFocusRef.current?.focus();
    return () => root.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-1000 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Dialog"}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={dialogRef}
        className={`relative w-full ${WIDTH[size]} bg-white rounded-2xl shadow-xl border border-gray-200 flex flex-col max-h-[90vh]`}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            ref={firstFocusRef}
            onClick={onClose}
            aria-label="Close dialog"
            className="border rounded px-2 py-1 text-sm bg-white hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="px-4 py-3 overflow-auto">
          {children}
        </div>

        {/* Sticky footer (optional) */}
        {footer ? (
          <div className="px-4 py-3 border-t bg-white sticky bottom-0">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
