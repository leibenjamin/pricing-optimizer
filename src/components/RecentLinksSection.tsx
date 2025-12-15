// src/components/RecentLinksSection.tsx

import { Section } from "./Section";

type RecentItem = { id: string; t: number };

type Props = {
  recents: RecentItem[];
  onReload: (id: string) => void;
  onCopy: (id: string) => void;
  onClearAll: () => void;
};

export function RecentLinksSection({ recents, onReload, onCopy, onClearAll }: Props) {
  return (
    <Section id="recent-short-links" title="Recent short links" className="order-5">
      <details className="text-xs">
        <summary className="cursor-pointer select-none font-medium mb-2">
          Show recents
        </summary>

        <ul className="text-xs space-y-1">
          {recents.length === 0 ? (
            <li className="text-gray-500">None yet</li>
          ) : (
            recents.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2"
              >
                <button
                  className="underline"
                  title={new Date(r.t).toLocaleString()}
                  onClick={() => onReload(r.id)}
                >
                  {r.id}
                </button>
                <button
                  className="border rounded px-2 py-0.5"
                  onClick={() => onCopy(r.id)}
                >
                  Copy
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="mt-2">
          <button
            className="text-xs border rounded px-2 py-1"
            onClick={onClearAll}
          >
            Clear recents
          </button>
        </div>
      </details>
    </Section>
  );
}
