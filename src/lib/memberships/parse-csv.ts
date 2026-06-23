import { rowToMembershipFields, type MembershipSheetRow } from "./sheet-map";

/** Minimal RFC4180-style CSV line parser (handles quoted fields). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseMembershipCsv(text: string): MembershipSheetRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: MembershipSheetRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const row = rowToMembershipFields(cells);
    if (!row) continue;
    if (i === 0 && /код|code|абонемент/i.test(row.externalCode + row.category)) {
      continue;
    }
    rows.push(row);
  }
  return rows;
}

export function parseIntField(raw: string): number {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return 0;
  return Math.round(n);
}

export function parseSaleDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    const dt = new Date(year, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}
