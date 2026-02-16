// ===== CSV パーサー =====

export const parseCsvRows = (text, delimiter = ",") => {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "\"") {
      if (inQuotes && next === "\"") { cell += "\""; i += 1; } else { inQuotes = !inQuotes; }
      continue;
    }
    if (!inQuotes && ch === delimiter) { row.push(cell); cell = ""; continue; }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((v) => v !== "")) rows.push(row);
      row = []; cell = ""; continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); if (row.some((v) => v !== "")) rows.push(row); }
  return rows;
};

export const detectDelimiter = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const sample = lines.slice(0, 5).join("\n");
  const commaCount = (sample.match(/,/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
};

export const normalizeHeader = (v) => String(v || "").replace(/\s/g, "").replace(/[()（）]/g, "").toLowerCase();

export const findIndexBy = (headersNorm, predicate) => headersNorm.findIndex(predicate);
