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

export function csvFromRows(rows: (string|number)[][]): string {
  return rows.map(r => r.map(x => {
    const s = String(x ?? "");
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(",")).join("\n");
}
