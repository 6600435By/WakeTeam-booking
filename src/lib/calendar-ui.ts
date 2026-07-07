import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { formatDateKey, parseTimeOnDate } from "@/lib/time";

export type CalendarDayCell = {
  dateKey: string;
  inMonth: boolean;
};

export function buildCalendarMonthDays(viewDateKey: string): CalendarDayCell[] {
  const viewDate = parseTimeOnDate(viewDateKey, "12:00");
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((day) => ({
    dateKey: formatDateKey(day),
    inMonth: day >= monthStart && day <= monthEnd,
  }));
}

export function shiftMonthDateKey(dateKey: string, deltaMonths: number): string {
  const d = parseTimeOnDate(dateKey, "12:00");
  return formatDateKey(addMonths(d, deltaMonths));
}

export function isDateKeyInRange(
  dateKey: string,
  min?: string,
  max?: string,
): boolean {
  if (min && dateKey < min) return false;
  if (max && dateKey > max) return false;
  return true;
}

export const CALENDAR_WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Безопасная опорная дата для календаря, если value ещё не выбран. */
export function resolveCalendarAnchorDateKey(
  value?: string | null,
  viewDate?: string | null,
): string {
  const candidate = viewDate ?? value ?? "";
  if (DATE_KEY_RE.test(candidate)) return candidate;
  return formatDateKey(new Date());
}
