import { Section } from "./Section";

type Props = {
  journal: string[];
  revenue: number;
  profit: number;
  activeCustomers: number;
  arpu: number;
  profitPerCustomer: number;
  grossMarginPct: number;
  onClear: () => void;
  onDownload: () => void;
};

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtPct = (x: number) => `${Math.round(x * 1000) / 10}%`;

export function ScenarioJournalSection({
  journal,
  revenue,
  profit,
  activeCustomers,
  arpu,
  profitPerCustomer,
  grossMarginPct,
  onClear,
  onDownload,
}: Props) {
  return (
    <Section id="scenario-journal" title="Scenario Journal" className="order-4">
      <ul className="text-xs text-gray-700 space-y-1 max-h-64 overflow-auto pr-1 wrap-break-word min-w-0">
        {journal.length === 0 ? (
          <li className="text-gray-400">
            Adjust sliders/toggles to log changes...
          </li>
        ) : (
          journal.map((line, i) => <li key={i}>{line}</li>)
        )}
        <li>
          Revenue (N=1000): <strong>{fmtUSD(revenue)}</strong>
        </li>
        <li>
          Profit (N=1000): <strong>{fmtUSD(profit)}</strong>
        </li>
        <li>
          Active customers:{" "}
          <strong>{activeCustomers.toLocaleString()}</strong>
        </li>
        <li>
          ARPU (active only): <strong>{fmtUSD(arpu)}</strong>
        </li>
        <li>
          Profit / customer (all N):{" "}
          <strong>{fmtUSD(profitPerCustomer)}</strong>
        </li>
        <li>
          Gross margin: <strong>{fmtPct(grossMarginPct)}</strong>
        </li>
      </ul>
      <div className="mt-2 flex gap-2">
        <button
          className="text-xs border px-2 py-1 rounded"
          onClick={onClear}
        >
          Clear
        </button>
        <button
          className="text-xs border px-2 py-1 rounded"
          onClick={onDownload}
        >
          Download .txt
        </button>
      </div>
    </Section>
  );
}
