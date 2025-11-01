// src/lib/explain.ts
export function explainGaps(prices:{good:number;better:number;best:number}, gaps:{gapGB:number;gapBB:number}) {
  const gb = prices.better - prices.good;
  const bb = prices.best - prices.better;
  const binds:string[] = [];
  if (gb <= gaps.gapGB + 1e-6) binds.push(`Better−Good gap binding (=${gb.toFixed(2)}, floor ${gaps.gapGB})`);
  if (bb <= gaps.gapBB + 1e-6) binds.push(`Best−Better gap binding (=${bb.toFixed(2)}, floor ${gaps.gapBB})`);
  return binds;
}

export function topDriver(tornadoRows: {name:string; deltaLow:number; deltaHigh:number}[]) {
  if (!tornadoRows.length) return null;
  const withMag = tornadoRows.map(r => ({...r, mag: Math.max(Math.abs(r.deltaLow), Math.abs(r.deltaHigh))}));
  withMag.sort((a,b) => b.mag - a.mag);
  const t = withMag[0];
  const dir = Math.abs(t.deltaHigh) >= Math.abs(t.deltaLow) ? "up" : "down";
  const amt = Math.round(Math.max(Math.abs(t.deltaLow), Math.abs(t.deltaHigh)));
  return `${t.name} (${dir}): ±$${amt}`;
}
