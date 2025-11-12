// src/components/InfoTip.tsx
import { useEffect, useRef, useState } from "react";

export default function InfoTip({
  html,
  ariaLabel = "Why these numbers?",
  side = "right",
  className = "",
}: {
  html: string;              // Trusted HTML from explain.ts
  ariaLabel?: string;
  side?: "right" | "left";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!open) return;
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <span className={`inline-block relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(v => !v)}
        className="ml-1 align-middle inline-flex items-center justify-center text-[10px] h-[18px] w-[18px] rounded-full border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 select-none"
      >
        ?
      </button>
      {open && (
        <div
          ref={popRef}
          role="dialog"
          className={`InfoTip-pop absolute z-60 top-[22px] ${side === "right" ? "left-0" : "right-0"} w-[280px] md:w-[340px] rounded-lg border border-slate-200 bg-white shadow-lg p-3 text-[12px] leading-5`}
          // The content comes from our own static dictionary (explain.ts).
          // If you ever let users contribute HTML, sanitize before passing.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </span>
  );
}
