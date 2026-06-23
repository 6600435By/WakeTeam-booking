import { Prisma } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import {
  addMinutes,
  formatDateKey,
  overlaps,
  parseTimeOnDate,
  TZ,
  weekdayMinsk,
} from "@/lib/time";

import { ACTIVE_APPOINTMENT_STATUSES } from "@/lib/appointment-status";

export type SlotDto = {
  startAt: string;
  endAt: string;
  staffId: string;
  staffName: string;
  status: "free" | "busy";
};

function parseWeekdays(s: string): Set<number> {
  return new Set(
    s
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !Number.isNaN(n)),
  );
}

function parseDurations(s: string): number[] {
  return s
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

function serviceAllowedOnDate(
  service: { weekdays: string },
  dateStr: string,
): boolean {
  const wd = weekdayMinsk(dateStr);
  return parseWeekdays(service.weekdays).has(wd);
}

function maxTime(a: string, b: string): string {
  return a >= b ? a : b;
}

function minTime(a: string, b: string): string {
  return a <= b ? a : b;
}

function subtractBreaks(
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

export async function getDaySlots(params: {
  serviceId: string;
  staffId: string;
  date: string;
  durationMinutes?: number;
}): Promise<{ slots: SlotDto[]; allowedDurations: number[] }> {
  const service = await prisma.service.findUnique({
    where: { id: params.serviceId },
    include: {
      staff: { include: { staff: { include: { schedules: true, breaks: true } } } },
    },
  });
  if (!service || !service.isActive || !service.isOnlineBookable) {
    return { slots: [], allowedDurations: [] };
  }
  if (!serviceAllowedOnDate(service, params.date)) {
    return { slots: [], allowedDurations: parseDurations(service.allowedDurations) };
  }

  const staff = service.staff
    .map((s) => s.staff)
    .find((s) => s.id === params.staffId && s.isActive && s.isVisible);
  if (!staff) return { slots: [], allowedDurations: [] };

  const allowedDurations = parseDurations(service.allowedDurations);
  const duration = params.durationMinutes ?? allowedDurations[0] ?? service.durationMinutes;

  const dayStart = parseTimeOnDate(params.date, "00:00");
  const dayEnd = parseTimeOnDate(params.date, "23:59");
  const appointments = await prisma.appointment.findMany({
    where: {
      staffId: staff.id,
      startAt: { gte: dayStart, lte: dayEnd },
      status: { in: ACTIVE_APPOINTMENT_STATUSES },
    },
  });

  const wd = weekdayMinsk(params.date);
  const rule = staff.schedules.find((r) => r.weekday === wd && r.isWorking);
  if (!rule) return { slots: [], allowedDurations };

  let windowFrom = rule.timeFrom;
  let windowTo = rule.timeTo;
  if (service.bookableFrom) windowFrom = maxTime(windowFrom, service.bookableFrom);
  if (service.bookableTo) windowTo = minTime(windowTo, service.bookableTo);

  const dayBreaks = staff.breaks.filter((b) => b.weekday === null || b.weekday === wd);
  const workIntervals = subtractBreaks(
    parseTimeOnDate(params.date, windowFrom),
    parseTimeOnDate(params.date, windowTo),
    dayBreaks,
    params.date,
  );

  const step = staff.slotMinutes;
  const slotStarts = new Map<string, SlotDto>();

  for (const interval of workIntervals) {
    for (
      let t = interval.from.getTime();
      t + step * 60_000 <= interval.to.getTime();
      t += step * 60_000
    ) {
      const slotStart = new Date(t);
      const key = slotStart.toISOString();
      if (slotStarts.has(key)) continue;

      const slotEnd = addMinutes(slotStart, step);
      const busy = appointments.some((a) =>
        overlaps(slotStart, slotEnd, a.startAt, a.endAt),
      );

      slotStarts.set(key, {
        startAt: slotStart.toISOString(),
        endAt: slotEnd.toISOString(),
        staffId: staff.id,
        staffName: staff.name,
        status: busy ? "busy" : "free",
      });
    }
  }

  const allSlots = [...slotStarts.values()].sort((a, b) =>
    a.startAt.localeCompare(b.startAt),
  );

  if (!params.durationMinutes) {
    return { slots: allSlots, allowedDurations };
  }

  const bookable: SlotDto[] = [];
  for (let i = 0; i < allSlots.length; i++) {
    const start = new Date(allSlots[i].startAt);
    const end = addMinutes(start, duration);
    const needed = duration / step;
    let ok = true;
    for (let j = 0; j < needed; j++) {
      const idx = i + j;
      if (!allSlots[idx] || allSlots[idx].status === "busy") {
        ok = false;
        break;
      }
      const expected = addMinutes(start, j * step).toISOString();
      if (allSlots[idx].startAt !== expected) {
        ok = false;
        break;
      }
    }
    if (ok) {
      bookable.push({
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        staffId: staff.id,
        staffName: staff.name,
        status: "free",
      });
    }
  }

  return { slots: bookable.length ? bookable : allSlots, allowedDurations };
}

export async function getAvailableSlots(params: {
  serviceId: string;
  staffId?: string | "any";
  date: string;
  durationMinutes?: number;
}): Promise<SlotDto[]> {
  const service = await prisma.service.findUnique({
    where: { id: params.serviceId },
    include: { staff: { include: { staff: true } } },
  });
  if (!service) return [];

  const duration =
    params.durationMinutes ??
    parseDurations(service.allowedDurations)[0] ??
    service.durationMinutes;

  const staffList =
    params.staffId && params.staffId !== "any"
      ? service.staff
          .map((s) => s.staff)
          .filter((s) => s.id === params.staffId && s.isActive && s.isVisible)
      : service.staff.map((s) => s.staff).filter((s) => s.isActive && s.isVisible);

  const results: SlotDto[] = [];
  for (const st of staffList) {
    const { slots } = await getDaySlots({
      serviceId: params.serviceId,
      staffId: st.id,
      date: params.date,
      durationMinutes: duration,
    });
    results.push(...slots.filter((s) => s.status === "free"));
  }

  results.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return results;
}

export async function nextPublicNumber(): Promise<number> {
  const last = await prisma.appointment.findFirst({
    orderBy: { publicNumber: "desc" },
    select: { publicNumber: true },
  });
  return (last?.publicNumber ?? 8_330_000) + 1;
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("375")) return `+${digits}`;
  if (digits.startsWith("80")) return `+3${digits.slice(1)}`;
  if (digits.length === 9) return `+375${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

function priceForDuration(basePrice: number, baseDuration: number, duration: number): number {
  return Math.round((basePrice / baseDuration) * duration * 100) / 100;
}

export type CreateBookingInput = {
  organizationId: string;
  serviceId: string;
  staffId: string;
  startAt: string;
  durationMinutes?: number;
  phone: string;
  firstName: string;
  lastName?: string;
  email?: string;
  comment?: string;
  source: "widget" | "admin";
};

export async function createBooking(
  input: CreateBookingInput,
  opts?: { skipSlotCheck?: boolean },
): Promise<{ id: string; publicNumber: number }> {
  const service = await prisma.service.findUniqueOrThrow({
    where: { id: input.serviceId },
    include: { branch: true },
  });

  const allowed = parseDurations(service.allowedDurations);
  const duration = input.durationMinutes ?? allowed[0] ?? service.durationMinutes;
  if (!allowed.includes(duration)) {
    throw new Error("INVALID_DURATION");
  }

  const startAt = new Date(input.startAt);
  const endAt = addMinutes(startAt, duration);
  const dateStr = formatDateKey(startAt);

  if (!opts?.skipSlotCheck) {
    const slots = await getAvailableSlots({
      serviceId: input.serviceId,
      staffId: input.staffId,
      date: dateStr,
      durationMinutes: duration,
    });
    const ok = slots.some(
      (s) =>
        s.staffId === input.staffId &&
        new Date(s.startAt).getTime() === startAt.getTime(),
    );
    if (!ok) throw new Error("SLOT_UNAVAILABLE");
  }

  const phone = normalizePhone(input.phone);
  const client = await prisma.client.upsert({
    where: {
      organizationId_phone: {
        organizationId: input.organizationId,
        phone,
      },
    },
    create: {
      organizationId: input.organizationId,
      phone,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
    },
    update: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email ?? undefined,
    },
  });

  const price = priceForDuration(service.price, service.durationMinutes, duration);
  const publicNumber = await nextPublicNumber();

  try {
    const appt = await prisma.appointment.create({
      data: {
        publicNumber,
        organizationId: input.organizationId,
        branchId: service.branchId,
        clientId: client.id,
        staffId: input.staffId,
        serviceId: service.id,
        startAt,
        endAt,
        durationMinutes: duration,
        price,
        status: "booked",
        source: input.source,
        comment: input.comment,
      },
    });
    return { id: appt.id, publicNumber: appt.publicNumber };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("SLOT_UNAVAILABLE");
    }
    throw e;
  }
}

function normalizeDurationForService(
  service: { allowedDurations: string; durationMinutes: number },
  duration: number,
): number {
  const allowed = parseDurations(service.allowedDurations);
  if (allowed.includes(duration)) return duration;
  const next = allowed.find((d) => d >= duration);
  return next ?? allowed[0] ?? service.durationMinutes;
}

async function resolveServiceForStaffMove(
  staffId: string,
  branchId: string,
  currentServiceId: string,
  startAt: Date,
): Promise<string> {
  const linked = await prisma.serviceStaff.findUnique({
    where: {
      serviceId_staffId: { serviceId: currentServiceId, staffId },
    },
  });
  if (linked) return currentServiceId;

  const staff = await prisma.staff.findUniqueOrThrow({ where: { id: staffId } });
  const candidates = await prisma.service.findMany({
    where: {
      branchId,
      isActive: true,
      staff: { some: { staffId } },
    },
    orderBy: { sortOrder: "asc" },
  });
  if (candidates.length === 0) throw new Error("SLOT_UNAVAILABLE");

  const dateStr = formatDateKey(startAt);
  const timeStr = formatInTimeZone(startAt, TZ, "HH:mm");

  if (staff.kind === "sup") {
    return (
      candidates.find((s) => /сап/i.test(s.name))?.id ??
      candidates.find((s) => parseDurations(s.allowedDurations).includes(30))
        ?.id ??
      candidates[0].id
    );
  }

  const wakeMatch = candidates.find((s) => {
    if (/сап/i.test(s.name)) return false;
    if (!serviceAllowedOnDate(s, dateStr)) return false;
    if (s.bookableFrom && timeStr < s.bookableFrom) return false;
    if (s.bookableTo && timeStr >= s.bookableTo) return false;
    return true;
  });
  return wakeMatch?.id ?? candidates.find((s) => !/сап/i.test(s.name))?.id ?? candidates[0].id;
}

export async function updateAppointment(
  id: string,
  data: {
    startAt?: string;
    staffId?: string;
    serviceId?: string;
    durationMinutes?: number;
    status?: string;
    comment?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  },
  opts?: { skipSlotCheck?: boolean },
) {
  const existing = await prisma.appointment.findUniqueOrThrow({
    where: { id },
    include: { client: true, service: true },
  });

  if (data.phone || data.firstName !== undefined || data.lastName !== undefined) {
    await prisma.client.update({
      where: { id: existing.clientId },
      data: {
        phone: data.phone ? normalizePhone(data.phone) : undefined,
        firstName: data.firstName,
        lastName: data.lastName,
      },
    });
  }

  let serviceId = data.serviceId ?? existing.serviceId;
  const staffId = data.staffId ?? existing.staffId;
  const startAt = data.startAt ? new Date(data.startAt) : existing.startAt;

  if (staffId !== existing.staffId && !data.serviceId) {
    serviceId = await resolveServiceForStaffMove(
      staffId,
      existing.branchId,
      existing.serviceId,
      startAt,
    );
  }

  const service = await prisma.service.findUniqueOrThrow({
    where: { id: serviceId },
  });
  let duration = normalizeDurationForService(
    service,
    data.durationMinutes ?? existing.durationMinutes,
  );
  const endAt = addMinutes(startAt, duration);

  if (
    !opts?.skipSlotCheck &&
    (data.startAt || data.staffId || data.serviceId || data.durationMinutes)
  ) {
    const dateStr = formatDateKey(startAt);
    const slots = await getAvailableSlots({
      serviceId,
      staffId,
      date: dateStr,
      durationMinutes: duration,
    });
    const ok = slots.some(
      (s) =>
        s.staffId === staffId &&
        new Date(s.startAt).getTime() === startAt.getTime(),
    );
    const sameSlot =
      existing.staffId === staffId &&
      existing.serviceId === serviceId &&
      existing.startAt.getTime() === startAt.getTime() &&
      existing.durationMinutes === duration;
    if (!ok && !sameSlot) throw new Error("SLOT_UNAVAILABLE");
  }

  const price = priceForDuration(
    service.price,
    service.durationMinutes,
    duration,
  );

  try {
    return await prisma.appointment.update({
      where: { id },
      data: {
        staffId,
        serviceId,
        startAt,
        endAt,
        durationMinutes: duration,
        price,
        status: data.status,
        comment: data.comment,
      },
      include: { client: true, service: true, staff: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("SLOT_UNAVAILABLE");
    }
    throw e;
  }
}
