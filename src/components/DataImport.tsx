// src/components/DataImport.tsx

import { importScenarioCSV, csvTemplate } from "../lib/csv";

type ScenarioJSON = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prices?: any; costs?: any; refPrices?: any; leak?: any; segments?: any;
};

export default function DataImport(props: {
  onPaste: (obj: ScenarioJSON) => void;
  onToast?: (kind: "success" | "error" | "info", msg: string) => void;
}) {
  const { onPaste, onToast } = props;

  const handleCSV = async (file: File) => {
    try {
      const text = await file.text();
      const sc = importScenarioCSV(text);
      const out: ScenarioJSON = {
        ...(sc.prices ? { prices: sc.prices } : {}),
        ...(sc.costs ? { costs: sc.costs } : {}),
        ...(sc.refPrices ? { refPrices: sc.refPrices } : {}),
        ...(sc.leak ? { leak: sc.leak } : {}),
        ...(sc.segments ? { segments: sc.segments } : {}),
        ...(sc.optConstraints ? { optConstraints: sc.optConstraints } : {}),
        ...(sc.optRanges ? { optRanges: sc.optRanges } : {}),
        ...(sc.priceRange ? { priceRange: sc.priceRange } : {}),
        ...(sc.priceRangeSource ? { priceRangeSource: sc.priceRangeSource } : {}),
        ...(sc.channelMix ? { channelMix: sc.channelMix } : {}),
        ...(sc.uncertainty !== undefined ? { uncertainty: sc.uncertainty } : {}),
        ...(sc.optimizerKind ? { optimizerKind: sc.optimizerKind } : {}),
      };
      if (Object.keys(out).length === 0) {
        onToast?.("error", "CSV contained no recognized fields");
        return;
      }
      onPaste(out);
      onToast?.("success", "Imported CSV");
    } catch (e) {
      onToast?.("error", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <label className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50 cursor-pointer">
        Import Scenario Parameters CSV
        <input
          type="file"
          accept=".csv,.tsv,text/csv,text/tab-separated-values"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleCSV(f);
            e.currentTarget.value = "";
          }}
          title="Upload scenario parameters CSV (refer to downloaded template for format)"
        />
      </label>
      <button
        type="button"
        className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50"
        onClick={() => {
          const blob = new Blob([csvTemplate()], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "pricing_scenario_template.csv";
          a.click();
          URL.revokeObjectURL(url);
        }}
        title="Download a CSV template for scenario parameters"
      >
        Download Scenario Parameters CSV Template
      </button>
    </div>
  );
}
