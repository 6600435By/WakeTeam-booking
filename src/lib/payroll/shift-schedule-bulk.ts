import { weekdayMinsk } from "@/lib/time";

export function parseWeekdaysCsv(weekdays: string): Set<number> {
  return new Set(
    weekdays
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 7),
  );
}

export function formatWeekdays(set: Set<number>): string {
  return [...set].sort((a, b) => a - b).join(",");
}

/** Даты месяца (YYYY-MM), попадающие в диапазон и дни недели. */
export function expandScheduleDates(
  month: string,
  weekdays: string,
  dateFrom?: string,
  dateTo?: string,
): string[] {
  const working = parseWeekdaysCsv(weekdays);
  if (working.size === 0) return [];

  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const rangeFrom = dateFrom && dateFrom.startsWith(month) ? dateFrom : `${month}-01`;
  const rangeTo =
    dateTo && dateTo.startsWith(month) ? dateTo : `${month}-${String(last).padStart(2, "0")}`;

  const fromDay = Math.max(1, parseInt(rangeFrom.split("-")[2] ?? "1", 10));
  const toDay = Math.min(last, parseInt(rangeTo.split("-")[2] ?? String(last), 10));

  const dates: string[] = [];
  for (let d = fromDay; d <= toDay; d++) {
    const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (working.has(weekdayMinsk(date))) dates.push(date);
  }
  return dates;
}

export function countBulkShiftSlots(
  month: string,
  rows: { weekdays: string }[],
  dateFrom?: string,
  dateTo?: string,
): number {
  return rows.reduce(
    (sum, row) =>
      sum + expandScheduleDates(month, row.weekdays, dateFrom, dateTo).length,
    0,
  );
}

export function countBulkTaskSlots(
  month: string,
  rows: { weekdays: string; description: string }[],
  dateFrom?: string,
  dateTo?: string,
): number {
  return rows
    .filter((row) => row.description.trim())
    .reduce(
      (sum, row) =>
        sum + expandScheduleDates(month, row.weekdays, dateFrom, dateTo).length,
      0,
    );
}
