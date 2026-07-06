import { prisma } from "@/lib/db";
import { timeToMinutes, minutesToTime } from "@/lib/calendar-grid";
import { weekdayMinsk } from "@/lib/time";
import { HOLIDAY_WEEKDAY } from "@/lib/branch-hours-constants";

export { HOLIDAY_WEEKDAY } from "@/lib/branch-hours-constants";

export type BranchWeekdayScheduleRow = {
  weekday: number;
  isWorking: boolean;
  timeFrom: string;
  timeTo: string;
};

export type BranchHolidayRow = {
  id: string;
  date: string;
  label: string | null;
  isWorking: boolean;
  timeFrom: string | null;
  timeTo: string | null;
};

export type BranchDayContext = {
  weekday: number;
  isHoliday: boolean;
  isWorking: boolean;
  timeFrom: string | null;
  timeTo: string | null;
  pricingWeekday: number;
};

const DEFAULT_FROM = "10:00";
const DEFAULT_TO = "21:00";

function unionReverseWeekdaySchedules(
  reverses: Array<{
    schedules: Array<{
      weekday: number;
      isWorking: boolean;
      timeFrom: string;
      timeTo: string;
    }>;
  }>,
): BranchWeekdayScheduleRow[] {
  const rows: BranchWeekdayScheduleRow[] = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    let minStart: number | null = null;
    let maxEnd: number | null = null;
    let anyWorking = false;
    for (const reverse of reverses) {
      const rule = reverse.schedules.find((s) => s.weekday === weekday);
      if (!rule?.isWorking) continue;
      if (timeToMinutes(rule.timeFrom) >= timeToMinutes(rule.timeTo)) continue;
      anyWorking = true;
      const from = timeToMinutes(rule.timeFrom);
      const to = timeToMinutes(rule.timeTo);
      if (minStart === null || from < minStart) minStart = from;
      if (maxEnd === null || to > maxEnd) maxEnd = to;
    }
    if (anyWorking && minStart !== null && maxEnd !== null) {
      rows.push({
        weekday,
        isWorking: true,
        timeFrom: minutesToTime(minStart),
        timeTo: minutesToTime(maxEnd),
      });
    } else {
      rows.push({
        weekday,
        isWorking: false,
        timeFrom: DEFAULT_FROM,
        timeTo: DEFAULT_TO,
      });
    }
  }
  return rows;
}

export function assertValidBranchScheduleTimes(
  rows: BranchWeekdayScheduleRow[],
): void {
  for (const row of rows) {
    if (!row.isWorking) continue;
    if (timeToMinutes(row.timeFrom) >= timeToMinutes(row.timeTo)) {
      throw new Error(
        `День ${row.weekday}: время начала должно быть раньше окончания`,
      );
    }
  }
}

export function defaultBranchWeekdaySchedules(): BranchWeekdayScheduleRow[] {
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    isWorking: true,
    timeFrom: DEFAULT_FROM,
    timeTo: DEFAULT_TO,
  }));
}

export function normalizeBranchWeekdaySchedules(
  rows: BranchWeekdayScheduleRow[],
): BranchWeekdayScheduleRow[] {
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

export async function ensureBranchWeekdaySchedules(branchId: string) {
  const existing = await prisma.branchWeekdaySchedule.findMany({
    where: { branchId },
    orderBy: { weekday: "asc" },
  });
  if (existing.length === 7) {
    return existing.map((r) => ({
      weekday: r.weekday,
      isWorking: r.isWorking,
      timeFrom: r.timeFrom,
      timeTo: r.timeTo,
    }));
  }

  const reverses = await prisma.staff.findMany({
    where: { branchId, kind: "revers", isActive: true },
    include: { schedules: true },
    orderBy: { sortOrder: "asc" },
  });
  let rows = defaultBranchWeekdaySchedules();
  if (reverses.length > 0) {
    rows = normalizeBranchWeekdaySchedules(unionReverseWeekdaySchedules(reverses));
  }

  await prisma.$transaction(
    rows.map((row) =>
      prisma.branchWeekdaySchedule.upsert({
        where: { branchId_weekday: { branchId, weekday: row.weekday } },
        create: { branchId, ...row },
        update: row,
      }),
    ),
  );

  return rows;
}

export async function getBranchWeekdaySchedules(
  branchId: string,
): Promise<BranchWeekdayScheduleRow[]> {
  const rows = await prisma.branchWeekdaySchedule.findMany({
    where: { branchId },
    orderBy: { weekday: "asc" },
  });
  if (rows.length < 7) {
    return ensureBranchWeekdaySchedules(branchId);
  }
  return normalizeBranchWeekdaySchedules(
    rows.map((r) => ({
      weekday: r.weekday,
      isWorking: r.isWorking,
      timeFrom: r.timeFrom,
      timeTo: r.timeTo,
    })),
  );
}

export async function saveBranchWeekdaySchedules(
  branchId: string,
  schedules: BranchWeekdayScheduleRow[],
  options?: { syncStaff?: boolean },
) {
  const normalized = normalizeBranchWeekdaySchedules(schedules);
  assertValidBranchScheduleTimes(normalized);
  await prisma.$transaction(
    normalized.map((row) =>
      prisma.branchWeekdaySchedule.upsert({
        where: { branchId_weekday: { branchId, weekday: row.weekday } },
        create: { branchId, ...row },
        update: {
          isWorking: row.isWorking,
          timeFrom: row.timeFrom,
          timeTo: row.timeTo,
        },
      }),
    ),
  );
  if (options?.syncStaff !== false) {
    await syncStaffSchedulesFromBranch(branchId);
  }
}

export async function syncStaffSchedulesFromBranch(
  branchId: string,
  weekday?: number,
) {
  const branchSchedules = await getBranchWeekdaySchedules(branchId);
  const staff = await prisma.staff.findMany({
    where: { branchId, isActive: true },
    select: { id: true },
  });
  const targetWeekdays =
    weekday != null ? branchSchedules.filter((s) => s.weekday === weekday) : branchSchedules;

  for (const member of staff) {
    for (const row of targetWeekdays) {
      await prisma.staffSchedule.upsert({
        where: {
          staffId_weekday: { staffId: member.id, weekday: row.weekday },
        },
        create: {
          staffId: member.id,
          weekday: row.weekday,
          isWorking: row.isWorking,
          timeFrom: row.timeFrom,
          timeTo: row.timeTo,
        },
        update: {
          isWorking: row.isWorking,
          timeFrom: row.timeFrom,
          timeTo: row.timeTo,
        },
      });
    }
  }
}

export async function listBranchHolidays(
  branchId: string,
  from?: string,
  to?: string,
): Promise<BranchHolidayRow[]> {
  const rows = await prisma.branchHoliday.findMany({
    where: {
      branchId,
      ...(from && to ? { date: { gte: from, lte: to } } : {}),
    },
    orderBy: { date: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    label: r.label,
    isWorking: r.isWorking,
    timeFrom: r.timeFrom,
    timeTo: r.timeTo,
  }));
}

export async function isBranchHoliday(branchId: string, date: string): Promise<boolean> {
  const row = await prisma.branchHoliday.findUnique({
    where: { branchId_date: { branchId, date } },
    select: { id: true },
  });
  return Boolean(row);
}

export async function getBranchHoliday(
  branchId: string,
  date: string,
): Promise<BranchHolidayRow | null> {
  const row = await prisma.branchHoliday.findUnique({
    where: { branchId_date: { branchId, date } },
  });
  if (!row) return null;
  return {
    id: row.id,
    date: row.date,
    label: row.label,
    isWorking: row.isWorking,
    timeFrom: row.timeFrom,
    timeTo: row.timeTo,
  };
}

export async function upsertBranchHoliday(
  branchId: string,
  input: {
    date: string;
    label?: string | null;
    isWorking?: boolean;
    timeFrom?: string | null;
    timeTo?: string | null;
  },
) {
  return prisma.branchHoliday.upsert({
    where: { branchId_date: { branchId, date: input.date } },
    create: {
      branchId,
      date: input.date,
      label: input.label?.trim() || null,
      isWorking: input.isWorking ?? true,
      timeFrom: input.timeFrom ?? null,
      timeTo: input.timeTo ?? null,
    },
    update: {
      label: input.label?.trim() || null,
      isWorking: input.isWorking ?? true,
      timeFrom: input.timeFrom ?? null,
      timeTo: input.timeTo ?? null,
    },
  });
}

export async function deleteBranchHoliday(branchId: string, date: string) {
  await prisma.branchHoliday.deleteMany({
    where: { branchId, date },
  });
}

export async function resolveBranchDayContext(
  branchId: string,
  date: string,
): Promise<BranchDayContext> {
  const weekday = weekdayMinsk(date);
  const schedules = await getBranchWeekdaySchedules(branchId);
  const weekdayRow = schedules.find((s) => s.weekday === weekday);
  const holiday = await getBranchHoliday(branchId, date);

  if (holiday) {
    const fallback = weekdayRow ?? {
      weekday,
      isWorking: true,
      timeFrom: DEFAULT_FROM,
      timeTo: DEFAULT_TO,
    };
    const isWorking = holiday.isWorking && fallback.isWorking;
    return {
      weekday,
      isHoliday: true,
      isWorking,
      timeFrom: isWorking
        ? holiday.timeFrom ?? fallback.timeFrom
        : null,
      timeTo: isWorking ? holiday.timeTo ?? fallback.timeTo : null,
      pricingWeekday: HOLIDAY_WEEKDAY,
    };
  }

  if (!weekdayRow?.isWorking) {
    return {
      weekday,
      isHoliday: false,
      isWorking: false,
      timeFrom: null,
      timeTo: null,
      pricingWeekday: weekday,
    };
  }

  return {
    weekday,
    isHoliday: false,
    isWorking: true,
    timeFrom: weekdayRow.timeFrom,
    timeTo: weekdayRow.timeTo,
    pricingWeekday: weekday,
  };
}

/** Окно работы филиала на дату (для смен и readiness). */
export async function getBranchPlannedWindowFromHours(
  branchId: string,
  date: string,
): Promise<{ start: string | null; end: string | null }> {
  const ctx = await resolveBranchDayContext(branchId, date);
  if (!ctx.isWorking) {
    return { start: null, end: null };
  }

  const reverses = await prisma.staff.findMany({
    where: { branchId, kind: "revers", isActive: true },
    include: { schedules: true },
  });

  let minStart: number | null = null;
  let maxEnd: number | null = null;
  for (const staff of reverses) {
    const rule = staff.schedules.find(
      (s) => s.weekday === ctx.weekday && s.isWorking,
    );
    if (!rule) continue;
    const intersected = applyBranchHoursToStaffRule(rule, ctx);
    if (!intersected) continue;
    const from = timeToMinutes(intersected.timeFrom);
    const to = timeToMinutes(intersected.timeTo);
    if (minStart === null || from < minStart) minStart = from;
    if (maxEnd === null || to > maxEnd) maxEnd = to;
  }

  if (minStart !== null && maxEnd !== null) {
    return {
      start: minutesToTime(minStart),
      end: minutesToTime(maxEnd),
    };
  }

  if (!ctx.timeFrom || !ctx.timeTo) {
    return { start: null, end: null };
  }
  return { start: ctx.timeFrom, end: ctx.timeTo };
}

function maxTime(a: string, b: string): string {
  return timeToMinutes(a) >= timeToMinutes(b) ? a : b;
}

function minTime(a: string, b: string): string {
  return timeToMinutes(a) <= timeToMinutes(b) ? a : b;
}

function applyBranchHoursToStaffRule<
  T extends { timeFrom: string; timeTo: string },
>(rule: T, branchCtx: BranchDayContext): T | undefined {
  if (!branchCtx.isWorking) return undefined;
  if (!branchCtx.timeFrom || !branchCtx.timeTo) return rule;
  const timeFrom = maxTime(rule.timeFrom, branchCtx.timeFrom);
  const timeTo = minTime(rule.timeTo, branchCtx.timeTo);
  if (timeToMinutes(timeFrom) >= timeToMinutes(timeTo)) return undefined;
  return { ...rule, timeFrom, timeTo };
}
