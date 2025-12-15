import { EXPLAIN } from "../src/lib/explain";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

type Hit = { id: string; file: string; line: number; col: number };

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function lineCol(text: string, index: number): { line: number; col: number } {
  let line = 1;
  let lastNl = -1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastNl = i;
    }
  }
  return { line, col: index - lastNl };
}

function addHits(out: Hit[], file: string, text: string, re: RegExp) {
  for (const m of text.matchAll(re)) {
    const id = m[1];
    if (!id) continue;
    const idx = m.index ?? 0;
    const { line, col } = lineCol(text, idx);
    out.push({ id, file, line, col });
  }
}

function normalizeFile(p: string) {
  return p.replace(/\\/g, "/");
}

function main() {
  const explainKeys = new Set(Object.keys(EXPLAIN));
  const hits: Hit[] = [];

  const root = process.cwd();
  const srcDir = path.join(root, "src");
  const appFile = path.join(srcDir, "App.tsx");

  const files = [
    ...walk(path.join(srcDir, "components")).filter((f) => f.endsWith(".tsx")),
    appFile,
  ].filter((f) => {
    try {
      return statSync(f).isFile();
    } catch {
      return false;
    }
  });

  const reInfoTip = /<InfoTip\b[^>]*\bid\s*=\s*"([^"]+)"/g;
  const reInfoTipExpr = /<InfoTip\b[^>]*\bid\s*=\s*\{\s*"([^"]+)"\s*\}/g;
  const reRiskBadge = /<RiskBadge\b[^>]*\binfoId\s*=\s*"([^"]+)"/g;

  for (const f of files) {
    const text = readFileSync(f, "utf8");
    addHits(hits, normalizeFile(path.relative(root, f)), text, reInfoTip);
    addHits(hits, normalizeFile(path.relative(root, f)), text, reInfoTipExpr);
    addHits(hits, normalizeFile(path.relative(root, f)), text, reRiskBadge);
  }

  const missing = hits.filter((h) => !explainKeys.has(h.id));
  if (missing.length) {
    console.error(`❌ Missing ${missing.length} InfoTip EXPLAIN key(s):`);
    missing
      .sort((a, b) => (a.id === b.id ? a.file.localeCompare(b.file) : a.id.localeCompare(b.id)))
      .forEach((h) => console.error(`- ${h.id} @ ${h.file}:${h.line}:${h.col}`));
    process.exit(1);
  }

  const used = new Set(hits.map((h) => h.id));
  const unused = [...explainKeys].filter((k) => !used.has(k));

  console.log(`✅ InfoTip keys OK (${used.size} used, ${unused.length} EXPLAIN keys unused).`);
}

main();

