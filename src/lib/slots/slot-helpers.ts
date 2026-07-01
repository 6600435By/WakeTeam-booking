import { overlaps, parseTimeOnDate, weekdayMinsk } from "@/lib/time";

export function parseWeekdays(s: string): Set<number> {
  return new Set(
    s
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !Number.isNaN(n)),
  );
}

export function serviceAllowedOnDate(
  service: { weekdays: string },
  dateStr: string,
): boolean {
  const wd = weekdayMinsk(dateStr);
  return parseWeekdays(service.weekdays).has(wd);
}

export function subtractBreaks(
  from: Date,
  to: Date,
  breaks: { timeFrom: string; timeTo: string }[],
  dateStr: string,
): { from: Date; to: Date }[] {
  let intervals = [{ from, to }];
  for (const br of breaks) {
    const bStart = parseTimeOnDate(dateStr, br.timeFrom);
    const bEnd = parseTimeOnDate(dateStr, br.timeTo);
    const next: { from: Date; to: Date }[] = [];
    for (const iv of intervals) {
      if (!overlaps(iv.from, iv.to, bStart, bEnd)) {
        next.push(iv);
        continue;
      }
      if (iv.from < bStart) next.push({ from: iv.from, to: bStart });
      if (bEnd < iv.to) next.push({ from: bEnd, to: iv.to });
    }
    intervals = next;
  }
  return intervals;
}
