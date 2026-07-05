import { seasonEndMonth, seasonStartMonth } from "./constants";

export function isBackupSeason(date = new Date()): boolean {
  const month = date.getUTCMonth() + 1;
  return month >= seasonStartMonth() && month <= seasonEndMonth();
}

export function isSeasonEndForceDay(date = new Date()): boolean {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (month !== seasonEndMonth()) return false;
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month, 0)).getUTCDate();
  return day === lastDay;
}

export function formatBackupId(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function parseBackupId(id: string): Date | null {
  const normalized = id
    .replace(
      /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
      "$1:$2:$3.$4Z",
    )
    .replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})Z$/, "$1:$2:$3Z");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatBackupLabel(id: string): string {
  const d = parseBackupId(id);
  if (!d) return id;
  return d.toLocaleString("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Calendar day in Europe/Minsk for grouping nightly db + files manifests. */
export function backupDayKey(id: string): string {
  const d = parseBackupId(id);
  if (!d) return id;
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Minsk" });
}

/** Date-only label for restore confirmation (DD.MM.YYYY). */
export function formatBackupConfirmDate(id: string): string {
  const d = parseBackupId(id);
  if (!d) return id;
  return d.toLocaleDateString("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
