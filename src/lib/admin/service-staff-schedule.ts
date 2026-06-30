export type StaffScheduleRow = {
  weekday: number;
  isWorking: boolean;
  timeFrom: string;
  timeTo: string;
};

const DEFAULT_FROM = "10:00";
const DEFAULT_TO = "18:00";

export function parseServiceWeekdays(weekdays: string): Set<number> {
  return new Set(
    weekdays
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 7),
  );
}

/** Строит недельное расписание ресурса из времени работы услуги. */
export function buildStaffSchedulesFromService(
  weekdays: string,
  bookableFrom: string | null,
  bookableTo: string | null,
): StaffScheduleRow[] {
  const working = parseServiceWeekdays(weekdays);
  const timeFrom = bookableFrom?.trim() || DEFAULT_FROM;
  const timeTo = bookableTo?.trim() || DEFAULT_TO;
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    isWorking: working.has(weekday),
    timeFrom,
    timeTo,
  }));
}

export function normalizeStaffSchedules(
  rows: StaffScheduleRow[],
): StaffScheduleRow[] {
  const map = new Map(rows.map((r) => [r.weekday, r]));
  return [1, 2, 3, 4, 5, 6, 7].map(
    (weekday) =>
      map.get(weekday) ?? {
        weekday,
        isWorking: false,
        timeFrom: DEFAULT_FROM,
        timeTo: DEFAULT_TO,
      },
  );
}
