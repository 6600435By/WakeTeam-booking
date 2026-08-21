import {
  getBranchWeekdaySchedules,
  listBranchHolidays,
  type BranchDayContext,
  type BranchHolidayRow,
  type BranchWeekdayScheduleRow,
} from "@/lib/branch-hours";
import { HOLIDAY_WEEKDAY } from "@/lib/branch-hours-constants";
import { prisma } from "@/lib/db";
import { slotOccupancyStatusWhere } from "@/lib/appointment-status";
import { effectiveScheduleRule } from "@/lib/staff-schedule-effective";
import {
  addMinutes,
  formatDateKey,
  overlaps,
  parseTimeOnDate,
  weekdayMinsk,
} from "@/lib/time";
import { serviceAllowedOnDate, subtractBreaks } from "@/lib/slots/slot-helpers";

const DEFAULT_FROM = "10:00";
const DEFAULT_TO = "21:00";
const SUP_DURATION_FALLBACK = 60;

function maxTime(a: string, b: string): string {
  return a >= b ? a : b;
}

function minTime(a: string, b: string): string {
  return a <= b ? a : b;
}

function parseDurations(s: string): number[] {
  return s
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

function dateKeysInRange(fromDate: string, maxDays: number): string[] {
  const keys: string[] = [];
  let cursor = fromDate;
  for (let i = 0; i < maxDays; i++) {
    keys.push(cursor);
    const d = new Date(cursor + "T12:00:00");
    d.setDate(d.getDate() + 1);
    cursor = formatDateKey(d);
  }
  return keys;
}

function branchCtxForDate(
  date: string,
  schedules: BranchWeekdayScheduleRow[],
  holidayByDate: Map<string, BranchHolidayRow>,
): BranchDayContext {
  const weekday = weekdayMinsk(date);
  const weekdayRow = schedules.find((s) => s.weekday === weekday);
  const holiday = holidayByDate.get(date);

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
      timeFrom: isWorking ? (holiday.timeFrom ?? fallback.timeFrom) : null,
      timeTo: isWorking ? (holiday.timeTo ?? fallback.timeTo) : null,
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

function applyBranchHoursToRule<T extends { timeFrom: string; timeTo: string }>(
  rule: T | undefined,
  branchCtx: BranchDayContext,
): T | undefined {
  if (!rule || !branchCtx.isWorking) return undefined;
  if (!branchCtx.timeFrom || !branchCtx.timeTo) return rule;
  const timeFrom = maxTime(rule.timeFrom, branchCtx.timeFrom);
  const timeTo = minTime(rule.timeTo, branchCtx.timeTo);
  if (timeFrom >= timeTo) return undefined;
  return { ...rule, timeFrom, timeTo };
}

type StaffRow = {
  id: string;
  name: string;
  isActive: boolean;
  isVisible: boolean;
  slotMinutes: number;
  schedules: { weekday: number; isWorking: boolean; timeFrom: string; timeTo: string }[];
  breaks: { weekday: number | null; timeFrom: string; timeTo: string }[];
};

function staffFreeForInterval(
  staffId: string,
  start: Date,
  end: Date,
  appointments: { staffId: string; startAt: Date; endAt: Date }[],
): boolean {
  return !appointments.some(
    (a) => a.staffId === staffId && overlaps(start, end, a.startAt, a.endAt),
  );
}

function wakeDayHasFree(params: {
  date: string;
  staff: StaffRow;
  service: { bookableFrom: string | null; bookableTo: string | null; weekdays: string };
  branchCtx: BranchDayContext;
  override: { isWorking: boolean; timeFrom: string; timeTo: string } | null | undefined;
  appointments: { staffId: string; startAt: Date; endAt: Date }[];
  nowMs: number;
}): boolean {
  const { date, staff, service, branchCtx, override, appointments, nowMs } = params;
  if (!serviceAllowedOnDate(service, date) || !branchCtx.isWorking) return false;

  const rule = applyBranchHoursToRule(
    effectiveScheduleRule(staff.schedules, override ?? null, branchCtx.weekday),
    branchCtx,
  );
  if (!rule) return false;

  let windowFrom = rule.timeFrom;
  let windowTo = rule.timeTo;
  if (service.bookableFrom) windowFrom = maxTime(windowFrom, service.bookableFrom);
  if (service.bookableTo) windowTo = minTime(windowTo, service.bookableTo);

  const dayBreaks = staff.breaks.filter(
    (b) => b.weekday === null || b.weekday === branchCtx.weekday,
  );
  const workIntervals = subtractBreaks(
    parseTimeOnDate(date, windowFrom),
    parseTimeOnDate(date, windowTo),
    dayBreaks,
    date,
  );

  const step = staff.slotMinutes;
  const todayKey = formatDateKey(new Date(nowMs));

  for (const interval of workIntervals) {
    for (
      let t = interval.from.getTime();
      t + step * 60_000 <= interval.to.getTime();
      t += step * 60_000
    ) {
      if (date === todayKey && t <= nowMs) continue;
      const slotStart = new Date(t);
      const slotEnd = addMinutes(slotStart, step);
      if (staffFreeForInterval(staff.id, slotStart, slotEnd, appointments)) {
        return true;
      }
    }
  }
  return false;
}

function supDayHasFree(params: {
  date: string;
  boards: StaffRow[];
  service: {
    bookableFrom: string | null;
    bookableTo: string | null;
    weekdays: string;
    durationMinutes: number;
    allowedDurations: string;
  };
  durationMinutes: number;
  branchCtx: BranchDayContext;
  overridesByStaff: Map<string, { isWorking: boolean; timeFrom: string; timeTo: string } | null>;
  appointments: { staffId: string; startAt: Date; endAt: Date }[];
  nowMs: number;
}): boolean {
  const {
    date,
    boards,
    service,
    durationMinutes,
    branchCtx,
    overridesByStaff,
    appointments,
    nowMs,
  } = params;
  if (!serviceAllowedOnDate(service, date) || !branchCtx.isWorking) return false;

  const slotStep = service.durationMinutes;
  const startStep = durationMinutes > slotStep ? durationMinutes : slotStep;
  const todayKey = formatDateKey(new Date(nowMs));
  const slotStarts = new Set<number>();

  for (const board of boards) {
    const rule = applyBranchHoursToRule(
      effectiveScheduleRule(
        board.schedules,
        overridesByStaff.get(board.id) ?? null,
        branchCtx.weekday,
      ),
      branchCtx,
    );
    if (!rule) continue;

    let windowFrom = rule.timeFrom;
    let windowTo = rule.timeTo;
    if (service.bookableFrom) windowFrom = maxTime(windowFrom, service.bookableFrom);
    if (service.bookableTo) windowTo = minTime(windowTo, service.bookableTo);

    const dayBreaks = board.breaks.filter(
      (b) => b.weekday === null || b.weekday === branchCtx.weekday,
    );
    const workIntervals = subtractBreaks(
      parseTimeOnDate(date, windowFrom),
      parseTimeOnDate(date, windowTo),
      dayBreaks,
      date,
    );

    for (const interval of workIntervals) {
      for (
        let t = interval.from.getTime();
        t + durationMinutes * 60_000 <= interval.to.getTime();
        t += startStep * 60_000
      ) {
        if (date === todayKey && t <= nowMs) continue;
        slotStarts.add(t);
      }
    }
  }

  for (const t of slotStarts) {
    const start = new Date(t);
    const end = addMinutes(start, durationMinutes);
    for (const board of boards) {
      const rule = applyBranchHoursToRule(
        effectiveScheduleRule(
          board.schedules,
          overridesByStaff.get(board.id) ?? null,
          branchCtx.weekday,
        ),
        branchCtx,
      );
      if (!rule) continue;
      let windowFrom = rule.timeFrom;
      let windowTo = rule.timeTo;
      if (service.bookableFrom) windowFrom = maxTime(windowFrom, service.bookableFrom);
      if (service.bookableTo) windowTo = minTime(windowTo, service.bookableTo);
      const startBound = parseTimeOnDate(date, windowFrom);
      const endBound = parseTimeOnDate(date, windowTo);
      if (start < startBound || end > endBound) continue;
      if (staffFreeForInterval(board.id, start, end, appointments)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * One cheap probe: load service/schedules/appointments once for the window,
 * then walk days until the first free date (or none within maxDays).
 */
export async function findFirstFreePublicDate(params: {
  serviceId: string;
  staffId?: string;
  fromDate: string;
  maxDays: number;
  durationMinutes?: number;
}): Promise<{ firstFreeDate: string | null }> {
  const maxDays = Math.max(1, Math.min(params.maxDays, 31));
  const dates = dateKeysInRange(params.fromDate, maxDays);
  const rangeStart = parseTimeOnDate(dates[0], "00:00");
  const rangeEnd = parseTimeOnDate(dates[dates.length - 1], "23:59");

  const service = await prisma.service.findUnique({
    where: { id: params.serviceId },
    include: {
      staff: { include: { staff: { include: { schedules: true, breaks: true } } } },
    },
  });
  if (!service || !service.isActive || !service.isOnlineBookable) {
    return { firstFreeDate: null };
  }

  const [branchSchedules, holidays] = await Promise.all([
    getBranchWeekdaySchedules(service.branchId),
    listBranchHolidays(service.branchId, dates[0], dates[dates.length - 1]),
  ]);
  const holidayByDate = new Map(holidays.map((h) => [h.date, h]));
  const nowMs = Date.now();

  if (service.kind === "sup") {
    const boards = service.staff
      .map((s) => s.staff)
      .filter((s) => s.isActive && s.isVisible) as StaffRow[];
    if (boards.length === 0) return { firstFreeDate: null };

    const allowed = parseDurations(service.allowedDurations);
    const duration =
      params.durationMinutes ??
      allowed[0] ??
      (service.durationMinutes || SUP_DURATION_FALLBACK);
    if (params.durationMinutes && allowed.length > 0 && !allowed.includes(params.durationMinutes)) {
      return { firstFreeDate: null };
    }

    const boardIds = boards.map((b) => b.id);
    const [appointments, overrideRows] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          staffId: { in: boardIds },
          startAt: { gte: rangeStart, lte: rangeEnd },
          status: slotOccupancyStatusWhere(),
        },
        select: { staffId: true, startAt: true, endAt: true },
      }),
      prisma.staffScheduleOverride.findMany({
        where: { staffId: { in: boardIds }, date: { in: dates } },
      }),
    ]);

    for (const date of dates) {
      const branchCtx = branchCtxForDate(date, branchSchedules, holidayByDate);
      const dayStart = parseTimeOnDate(date, "00:00").getTime();
      const dayEnd = parseTimeOnDate(date, "23:59").getTime();
      const dayAppts = appointments.filter(
        (a) => a.startAt.getTime() >= dayStart && a.startAt.getTime() <= dayEnd,
      );
      const overridesByStaff = new Map<
        string,
        { isWorking: boolean; timeFrom: string; timeTo: string } | null
      >();
      for (const id of boardIds) overridesByStaff.set(id, null);
      for (const row of overrideRows) {
        if (row.date !== date) continue;
        overridesByStaff.set(row.staffId, {
          isWorking: row.isWorking,
          timeFrom: row.timeFrom,
          timeTo: row.timeTo,
        });
      }

      if (
        supDayHasFree({
          date,
          boards,
          service,
          durationMinutes: duration,
          branchCtx,
          overridesByStaff,
          appointments: dayAppts,
          nowMs,
        })
      ) {
        return { firstFreeDate: date };
      }
    }
    return { firstFreeDate: null };
  }

  if (!params.staffId) {
    return { firstFreeDate: null };
  }

  const staff = service.staff
    .map((s) => s.staff)
    .find((s) => s.id === params.staffId && s.isActive && s.isVisible) as
    | StaffRow
    | undefined;
  if (!staff) return { firstFreeDate: null };

  const [appointments, overrideRows] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        staffId: staff.id,
        startAt: { gte: rangeStart, lte: rangeEnd },
        status: slotOccupancyStatusWhere(),
      },
      select: { staffId: true, startAt: true, endAt: true },
    }),
    prisma.staffScheduleOverride.findMany({
      where: { staffId: staff.id, date: { in: dates } },
    }),
  ]);
  const overrideByDate = new Map(
    overrideRows.map((row) => [
      row.date,
      { isWorking: row.isWorking, timeFrom: row.timeFrom, timeTo: row.timeTo },
    ]),
  );

  for (const date of dates) {
    const branchCtx = branchCtxForDate(date, branchSchedules, holidayByDate);
    const dayStart = parseTimeOnDate(date, "00:00").getTime();
    const dayEnd = parseTimeOnDate(date, "23:59").getTime();
    const dayAppts = appointments.filter(
      (a) => a.startAt.getTime() >= dayStart && a.startAt.getTime() <= dayEnd,
    );
    if (
      wakeDayHasFree({
        date,
        staff,
        service,
        branchCtx,
        override: overrideByDate.get(date),
        appointments: dayAppts,
        nowMs,
      })
    ) {
      return { firstFreeDate: date };
    }
  }

  return { firstFreeDate: null };
}
