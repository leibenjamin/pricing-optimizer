import { Section } from "./Section";
import InfoTip from "./InfoTip";

type Props = {
  onExportJson: () => void;
  onExportCsv: () => void;
  onSaveShortLink: () => void;
  onCopyLink: () => void;
  onCopyLongUrl: () => void;
  onTestBackend: () => void;
};

export function ShareExportSection({
  onExportJson,
  onExportCsv,
  onSaveShortLink,
  onCopyLink,
  onCopyLongUrl,
  onTestBackend,
}: Props) {
  return (
    <Section id="share-links" title="Share & export">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded border p-2 bg-white">
          <div className="text-[12px] font-semibold text-slate-800 mb-1">Links</div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              className="text-xs border px-2 py-1 rounded"
              onClick={onSaveShortLink}
              title="Create a short link (Cloudflare KV)"
            >
              Save short link
            </button>
            <button
              className="border rounded px-2 py-1 text-sm bg-white hover:bg-gray-50"
              onClick={onCopyLink}
              title="Copy URL with current short link id if present"
            >
              Copy link
            </button>
            <button
              className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50"
              onClick={onCopyLongUrl}
              title="Copy a long URL with ladder + feature flags only"
            >
              Copy long URL
            </button>
          </div>
          <div className="text-[11px] text-slate-600 mt-1">
            Short link and JSON carry full fidelity. Long URL stays lightweight (ladder + toggles) to keep links short, shareable, and avoid leaking detailed model settings.
          </div>
        </div>

        <div className="rounded border p-2 bg-white">
          <div className="text-[12px] font-semibold text-slate-800 mb-1">Files</div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              className="border px-2 py-1 rounded bg-white hover:bg-gray-50"
              onClick={onExportJson}
              title="Full JSON of scenario (ladder, leak, refs, features, segments, constraints, analysis)"
            >
              Export JSON
            </button>
            <button
              className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50"
              onClick={onExportCsv}
              title="CSV of ladder/leak/segments (no constraints/features/analysis)"
            >
              Export Sales Parameters CSV
            </button>
            <button
              className="text-xs border px-2 py-1 rounded bg-white hover:bg-gray-50"
              onClick={onTestBackend}
            >
              Test backend
            </button>
          </div>
          <div className="text-[11px] text-slate-600 mt-1">
            JSON includes prices/costs/features/refs/leak/segments + optimizer ranges/constraints, tornado/retention (with KPI/unit), price ranges, channel blend, uncertainty, and optimizer engine. CSV stays light on purpose (ladder/leak/segments only) so it’s clean for spreadsheets and doesn’t embed app-specific knobs.
          </div>
        </div>
      </div>
      <div className="text-[11px] text-slate-600 mt-2 flex items-center gap-1">
        <InfoTip id="save.share" ariaLabel="What do exports include?" />
        <span>Use JSON/short link for full fidelity; CSV/long URL for lightweight sharing.</span>
      </div>
    </Section>
  );
}
