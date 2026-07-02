import { isCompletePhone, normalizePhone } from "@/lib/phone";

/** Rubitime clients export (tab-separated). */
export type RubitimeClientRow = {
  externalId: string;
  createdAt: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  email: string | null;
  blacklisted: boolean;
  source: string | null;
  appointmentCount: number | null;
  totalAmount: number | null;
  notes: string | null;
};

function parseCsvLine(line: string, delimiter: string): string[] {
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
    } else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function cell(row: Record<string, string>, key: string): string {
  return (row[key] ?? "").trim();
}

/** Rubitime sometimes exports Имя empty and puts first name in «Фамилия». */
export function mapRubitimeClientName(row: Record<string, string>): {
  firstName: string | null;
  lastName: string | null;
} {
  const ima = cell(row, "Имя");
  const fam = cell(row, "Фамилия");
  const otch = cell(row, "Отчество");

  if (ima) {
    return {
      firstName: ima,
      lastName: fam || null,
    };
  }
  if (fam) {
    return {
      firstName: fam,
      lastName: otch || null,
    };
  }
  return { firstName: otch || null, lastName: null };
}

function parseIntField(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return null;
  return Math.round(n);
}

function buildNotes(row: Record<string, string>): string | null {
  const parts: string[] = [];
  const id = cell(row, "#");
  if (id) parts.push(`Rubitime #${id}`);
  const created = cell(row, "Дата создания");
  if (created) parts.push(`создан: ${created}`);
  const appts = cell(row, "Записей");
  const total = cell(row, "Общая сумма");
  if (appts || total) {
    parts.push(`записей: ${appts || "0"}, сумма: ${total || "0"}`);
  }
  const source = cell(row, "Источник");
  if (source) parts.push(`источник: ${source}`);
  if (cell(row, "В черном списке")) parts.push("чёрный список");
  if (cell(row, "Персональная скидка")) {
    parts.push(`скидка: ${cell(row, "Персональная скидка")}`);
  }
  return parts.length ? parts.join("; ") : null;
}

export function parseRubitimeClientsTsv(text: string): RubitimeClientRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const header = parseCsvLine(lines[0], delimiter);
  const rows: RubitimeClientRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delimiter);
    const record: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      record[header[c]] = cells[c] ?? "";
    }

    const phoneRaw = cell(record, "Телефон");
    if (!phoneRaw) continue;

    const { firstName, lastName } = mapRubitimeClientName(record);
    const email = cell(record, "Email") || null;

    rows.push({
      externalId: cell(record, "#"),
      createdAt: cell(record, "Дата создания") || null,
      firstName,
      lastName,
      phone: phoneRaw,
      email,
      blacklisted: Boolean(cell(record, "В черном списке")),
      source: cell(record, "Источник") || null,
      appointmentCount: parseIntField(cell(record, "Записей")),
      totalAmount: parseIntField(cell(record, "Общая сумма")),
      notes: buildNotes(record),
    });
  }

  return rows;
}

export type RubitimeImportRow = RubitimeClientRow & {
  canonicalPhone: string;
};

/** Merge duplicate phones — keep richest name/email, combine notes. */
export function dedupeRubitimeClients(rows: RubitimeClientRow[]): RubitimeImportRow[] {
  const byPhone = new Map<string, RubitimeImportRow>();

  for (const row of rows) {
    if (!isCompletePhone(row.phone)) continue;
    const canonicalPhone = normalizePhone(row.phone);
    const existing = byPhone.get(canonicalPhone);

    if (!existing) {
      byPhone.set(canonicalPhone, { ...row, canonicalPhone });
      continue;
    }

    byPhone.set(canonicalPhone, {
      ...existing,
      firstName: existing.firstName || row.firstName,
      lastName: existing.lastName || row.lastName,
      email: existing.email || row.email,
      blacklisted: existing.blacklisted || row.blacklisted,
      appointmentCount: Math.max(
        existing.appointmentCount ?? 0,
        row.appointmentCount ?? 0,
      ) || null,
      totalAmount: Math.max(existing.totalAmount ?? 0, row.totalAmount ?? 0) || null,
      notes: mergeNotes(existing.notes, row.notes),
    });
  }

  return [...byPhone.values()];
}

function mergeNotes(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  if (a.includes(b) || b.includes(a)) return a.length >= b.length ? a : b;
  return `${a}; ${b}`;
}
