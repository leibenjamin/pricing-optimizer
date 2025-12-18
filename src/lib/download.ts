// src/lib/download.ts
export function downloadBlob(data: BlobPart, name: string, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Mitigate CSV/formula injection in spreadsheet apps (Excel/Sheets):
// If a string cell begins with =, +, -, or @ (optionally preceded by whitespace),
// prefix a single quote to force text interpretation.
const DANGEROUS_CSV_PREFIX = /^[\s]*[=+\-@]/;

export function sanitizeSpreadsheetCell(value: string): string {
  if (!value) return value;
  if (value.startsWith("'")) return value;
  return DANGEROUS_CSV_PREFIX.test(value) ? `'${value}` : value;
}

export function csvFromRows(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return "";
          if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
          if (typeof cell === "boolean") return cell ? "true" : "false";
          const raw = String(cell);
          const safe = sanitizeSpreadsheetCell(raw);
          return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(",")
    )
    .join("\n");
}
