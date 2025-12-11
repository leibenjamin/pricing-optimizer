import InfoTip from "./InfoTip";

type RiskBadgeProps = {
  note?: string | null;
  title?: string;
  className?: string;
  infoId?: string;
};

export default function RiskBadge({ note, title, className, infoId }: RiskBadgeProps) {
  if (!note) return null;
  const tooltip =
    title ??
    note ??
    "Preset uncertainty band; see Uncertainty and Risk notes for context.";
  const display = note.includes(" - ") ? note.split(" - ")[0] : note;
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 ${className ?? ""}`.trim()}
        title={tooltip}
      >
        {display}
      </span>
      {infoId ? <InfoTip id={infoId} ariaLabel="About uncertainty badge" /> : null}
    </span>
  );
}
