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

export function parsePriceField(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

function dateFromYmd(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(year, month - 1, day);
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null;
  }
  return dt;
}

/** Google Sheets serial date (days since 1899-12-30). */
function parseGoogleSheetSerial(raw: string): Date | null {
  if (!/^\d{4,5}(\.\d+)?$/.test(raw)) return null;
  const serial = parseFloat(raw);
  if (serial < 1 || serial > 200_000) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000;
  const dt = new Date(ms);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function parseSaleDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  // DD.MM.YYYY / DD/MM/YYYY — формат Google-таблицы; `new Date("12.04.2026")` даёт 4 декабря
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + parseInt(dmy[3], 10) : parseInt(dmy[3], 10);
    return dateFromYmd(year, parseInt(dmy[2], 10), parseInt(dmy[1], 10));
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return dateFromYmd(parseInt(iso[1], 10), parseInt(iso[2], 10), parseInt(iso[3], 10));
  }

  const serial = parseGoogleSheetSerial(s);
  if (serial) return serial;

  // Только полный ISO datetime — без `new Date("12.04.2026")` и прочих неоднозначных строк
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  return null;
}
