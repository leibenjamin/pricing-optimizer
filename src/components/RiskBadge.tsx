type RiskBadgeProps = {
  note?: string | null;
  title?: string;
  className?: string;
};

export default function RiskBadge({ note, title, className }: RiskBadgeProps) {
  if (!note) return null;
  const tooltip = title ?? "Preset uncertainty band; see Uncertainty and Risk notes for context.";
  return (
    <span
      className={`rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 ${className ?? ""}`.trim()}
      title={tooltip}
    >
      {note}
    </span>
  );
}
