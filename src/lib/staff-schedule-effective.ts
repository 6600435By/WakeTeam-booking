export type StaffScheduleLike = {
  weekday: number;
  isWorking: boolean;
  timeFrom: string;
  timeTo: string;
};

export type StaffScheduleOverrideLike = {
  date?: string;
  isWorking: boolean;
  timeFrom: string;
  timeTo: string;
};

export function getWeekdayScheduleRule(
  schedules: StaffScheduleLike[],
  weekday: number,
): StaffScheduleLike | undefined {
  const rule = schedules.find((s) => Number(s.weekday) === weekday);
  if (!rule || !rule.isWorking) return undefined;
  return rule;
}

export function effectiveScheduleRule(
  schedules: StaffScheduleLike[],
  override: StaffScheduleOverrideLike | null | undefined,
  weekday: number,
): StaffScheduleLike | undefined {
  if (override) {
    return override.isWorking
      ? {
          weekday,
          isWorking: true,
          timeFrom: override.timeFrom,
          timeTo: override.timeTo,
        }
      : undefined;
  }
  return getWeekdayScheduleRule(schedules, weekday);
}

export function effectiveSchedulesForDay(
  schedules: StaffScheduleLike[],
  override: StaffScheduleOverrideLike | null | undefined,
  weekday: number,
): StaffScheduleLike[] {
  const effective = effectiveScheduleRule(schedules, override, weekday);
  const hasWeekday = schedules.some((s) => Number(s.weekday) === weekday);

  if (!effective) {
    if (!hasWeekday) return schedules;
    return schedules.map((s) =>
      Number(s.weekday) === weekday ? { ...s, isWorking: false } : s,
    );
  }

  if (!hasWeekday) {
    return [...schedules, effective];
  }
  return schedules.map((s) =>
    Number(s.weekday) === weekday ? effective : s,
  );
}
