// src/components/ActionCluster.tsx

export default function ActionCluster({
  chart,
  id,
  csv = true,
  className = "",
}: {
  chart: "frontier" | "takerate" | "waterfall" | "tornado";
  id: string;
  csv?: boolean;
  className?: string;
}) {
  function send(type: "png" | "csv") {
    window.dispatchEvent(
      new CustomEvent(`export:${chart}`, { detail: { id, type } })
    );
  }

  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      <button
        className="border rounded px-2 py-0.5 bg-white hover:bg-gray-50"
        onClick={() => send("png")}
      >
        PNG
      </button>
      {csv && (
        <button
          className="border rounded px-2 py-0.5 bg-white hover:bg-gray-50"
          onClick={() => send("csv")}
        >
          CSV
        </button>
      )}
    </div>
  );
}
