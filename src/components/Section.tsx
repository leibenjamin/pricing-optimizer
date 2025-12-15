import type { ReactNode } from "react";

type SectionProps = {
  title: ReactNode;
  id?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Section({ title, id, actions, children, className = "" }: SectionProps) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 md:scroll-mt-32 rounded-2xl shadow-sm p-3 md:p-4 border border-slate-200 bg-white print-avoid print-card print-pad ${className}`}
    >
      <div className="mb-3 print:mb-2 flex flex-wrap items-start gap-3 md:items-center md:justify-between">
        <h2 className="font-semibold text-lg print:text-base print-tight">{title}</h2>
        {/* Hide the action toolbar on print */}
        {actions ? (
          <div className="no-print flex-1 min-w-60 md:min-w-0 flex flex-wrap justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      <div className="space-y-3 print-space">{children}</div>
    </section>
  );
}
