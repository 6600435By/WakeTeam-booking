import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const TZ = "Europe/Minsk";

export function parseTimeOnDate(dateStr: string, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const [y, mo, d] = dateStr.split("-").map(Number);
  const local = new Date(y, mo - 1, d, h, m, 0, 0);
  return fromZonedTime(local, TZ);
}

export function formatDateKey(date: Date): string {
  return formatInTimeZone(date, TZ, "yyyy-MM-dd");
}

export function weekdayMinsk(dateStr: string): number {
  const d = toZonedTime(parseTimeOnDate(dateStr, "12:00"), TZ);
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function formatTimeMinsk(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

/** Значение для input[type=datetime-local] в часовом поясе Minsk */
export function toDatetimeLocalValue(iso: string): string {
  return formatInTimeZone(new Date(iso), TZ, "yyyy-MM-dd'T'HH:mm");
}

export function fromDatetimeLocalValue(value: string): string {
  const [datePart, timePart] = value.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, m] = (timePart ?? "00:00").split(":").map(Number);
  const local = new Date(y, mo - 1, d, h, m, 0, 0);
  return fromZonedTime(local, TZ).toISOString();
}

export function todayDatetimeLocalValue(): string {
  return formatInTimeZone(new Date(), TZ, "yyyy-MM-dd'T'HH:mm");
}
