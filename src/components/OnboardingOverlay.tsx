// src/components/OnboardingOverlay.tsx

import { useEffect, useMemo } from "react";

type Step = {
  id: string;
  title: string;
  body: string;
  targetId?: string;
  helper?: string;
};

export default function OnboardingOverlay(props: {
  open: boolean;
  stepIndex: number;
  steps: readonly Step[];
  onBack: () => void;
  onNext: () => void;
  onDismiss: () => void;
  onJump?: (targetId: string) => void;
}) {
  const { open, stepIndex, steps, onBack, onNext, onDismiss, onJump } = props;
  const step = steps[stepIndex];

  // Highlight the target section/card for the active step.
  useEffect(() => {
    if (!open || !step?.targetId) return;
    const targetId = step.targetId;
    // Jump first (may switch tabs / render the target into the DOM).
    onJump?.(targetId);

    let highlighted: HTMLElement | null = null;
    let raf: number | null = null;
    let tries = 0;
    const maxTries = 20;

    const applyHighlight = () => {
      tries += 1;
      const el = document.getElementById(targetId);
      if (!el) {
        if (tries < maxTries) raf = requestAnimationFrame(applyHighlight);
        return;
      }

      highlighted = el;
      el.classList.add("onboarding-highlight");
      el.setAttribute("data-onboarding-highlight", "true");

      if (!onJump) {
        // Fallback to the native behavior if no scroll helper was provided.
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };

    raf = requestAnimationFrame(applyHighlight);

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      if (!highlighted) return;
      highlighted.classList.remove("onboarding-highlight");
      highlighted.removeAttribute("data-onboarding-highlight");
    };
  }, [open, step?.targetId, step?.id, onJump]);

  // Prevent body scroll while the overlay is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const progressLabel = useMemo(() => {
    return `Step ${stepIndex + 1} of ${steps.length}`;
  }, [stepIndex, steps.length]);

  if (!open || !step) return null;

  const isLast = stepIndex === steps.length - 1;

  return (
    <div
      className="no-print fixed inset-0 z-70 flex items-center justify-center bg-slate-900/70 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-heading"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between text-xs text-slate-500 uppercase tracking-wide">
          <span>{progressLabel}</span>
          <button
            type="button"
            className="text-[11px] uppercase tracking-wide text-slate-500 hover:text-slate-700"
            onClick={onDismiss}
          >
            Skip
          </button>
        </div>

        <h2 id="onboarding-heading" className="mt-2 text-lg font-semibold text-slate-900">
          {step.title}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{step.body}</p>
        {step.helper && (
          <p className="mt-2 text-xs text-slate-500 border-l-2 border-slate-200 pl-2">
            {step.helper}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {step.targetId && (
            <button
              type="button"
              className="text-xs border px-3 py-1.5 rounded bg-white hover:bg-slate-50"
              onClick={() => {
                onJump?.(step.targetId!);
              }}
            >
              Focus that section
            </button>
          )}

          <div className="ml-auto flex gap-2">
            <button
              type="button"
              className="text-xs border px-3 py-1.5 rounded bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={onBack}
              disabled={stepIndex === 0}
            >
              Back
            </button>
            <button
              type="button"
              className="text-xs border border-sky-600 bg-sky-600 text-white px-3 py-1.5 rounded hover:bg-sky-500"
              onClick={isLast ? onDismiss : onNext}
            >
              {isLast ? "Finish tour" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
