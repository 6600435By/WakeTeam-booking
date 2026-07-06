import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const TZ = "Europe/Minsk";

export function parseTimeOnDate(dateStr: string, time: string, tz: string = TZ): Date {
  const [h, m] = time.split(":").map(Number);
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return fromZonedTime(`${dateStr}T${hh}:${mm}:00`, tz);
}

export function formatDateKey(date: Date): string {
  return formatInTimeZone(date, TZ, "yyyy-MM-dd");
}

/** YYYY-MM-DD → DD.MM.YYYY */
export function formatDateKeyRu(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return dateKey;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export function formatDateMinsk(
  iso: string | Date | null | undefined,
  empty = "—",
): string {
  if (!iso) return empty;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return empty;
  return formatInTimeZone(d, TZ, "dd.MM.yyyy");
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

export function fromDatetimeLocalValue(value: string, tz: string = TZ): string {
  const [datePart, timePart] = value.split("T");
  const [h, m] = (timePart ?? "00:00").split(":").map(Number);
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return fromZonedTime(`${datePart}T${hh}:${mm}:00`, tz).toISOString();
}

export function todayDatetimeLocalValue(): string {
  return formatInTimeZone(new Date(), TZ, "yyyy-MM-dd'T'HH:mm");
}

export function todayDateKeyMinsk(): string {
  return formatDateKey(new Date());
}

/** Слоты на сегодня: оставляет только те, что ещё не начались (Europe/Minsk). */
export function filterPastSlotsForToday<T extends { startAt: string }>(
  dateStr: string,
  slots: T[],
  now: Date = new Date(),
): T[] {
  if (dateStr !== formatDateKey(now)) return slots;
  const nowMs = now.getTime();
  return slots.filter((s) => new Date(s.startAt).getTime() > nowMs);
}
