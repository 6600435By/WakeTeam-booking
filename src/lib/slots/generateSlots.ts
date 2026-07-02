import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import type { DbClient } from "@/lib/db-types";
import {
  priceForDuration,
  resolveServicePrice,
  type ServicePriceRuleDto,
} from "@/lib/service-pricing";
import {
  addMinutes,
  filterPastSlotsForToday,
  formatDateKey,
  overlaps,
  parseTimeOnDate,
  TZ,
  weekdayMinsk,
} from "@/lib/time";

import { ACTIVE_APPOINTMENT_STATUSES } from "@/lib/appointment-status";
import { normalizeAdminDuration } from "@/lib/admin-duration";
import { upsertClientByPhone } from "@/lib/clients/upsert";
import { parseWeekdays, serviceAllowedOnDate, subtractBreaks } from "@/lib/slots/slot-helpers";

export type SlotDto = {
  startAt: string;
  endAt: string;
  staffId: string;
  staffName: string;
  status: "free" | "busy";
};

export type SupSlotDto = {
  startAt: string;
  endAt: string;
  status: "free" | "busy";
  availableBoards: number;
};

const SUP_DURATION_MINUTES = 60;
const SUP_SLOT_STEP = 60;

function parseDurations(s: string): number[] {
  return s
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

function maxTime(a: string, b: string): string {
  return a >= b ? a : b;
}

function minTime(a: string, b: string): string {
  return a <= b ? a : b;
}

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

export async function getDaySlots(params: {
  serviceId: string;
  staffId: string;
  date: string;
  durationMinutes?: number;
  forAdmin?: boolean;
  excludeAppointmentId?: string;
}): Promise<{ slots: SlotDto[]; allowedDurations: number[] }> {
  const service = await prisma.service.findUnique({
    where: { id: params.serviceId },
    include: {
      staff: { include: { staff: { include: { schedules: true, breaks: true } } } },
    },
  });
  if (!service || !service.isActive) {
    return { slots: [], allowedDurations: [] };
  }
  if (!params.forAdmin && !service.isOnlineBookable) {
    return { slots: [], allowedDurations: [] };
  }
  if (!serviceAllowedOnDate(service, params.date)) {
    return { slots: [], allowedDurations: parseDurations(service.allowedDurations) };
  }

  const staff = service.staff
    .map((s) => s.staff)
    .find(
      (s) =>
        s.id === params.staffId &&
        s.isActive &&
        (params.forAdmin || s.isVisible),
    );
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
      ...(params.excludeAppointmentId
        ? { id: { not: params.excludeAppointmentId } }
        : {}),
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

  const allSlots = filterPastSlotsForToday(
    params.date,
    [...slotStarts.values()].sort((a, b) => a.startAt.localeCompare(b.startAt)),
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

export async function getSupDaySlots(params: {
  serviceId: string;
  date: string;
  forAdmin?: boolean;
  excludeAppointmentId?: string;
}): Promise<{ slots: SupSlotDto[]; allowedDurations: number[] }> {
  const service = await prisma.service.findUnique({
    where: { id: params.serviceId },
    include: {
      staff: { include: { staff: { include: { schedules: true, breaks: true } } } },
    },
  });
  if (!service || !service.isActive) {
    return { slots: [], allowedDurations: [] };
  }
  if (!params.forAdmin && !service.isOnlineBookable) {
    return { slots: [], allowedDurations: [] };
  }
  if (!serviceAllowedOnDate(service, params.date)) {
    return { slots: [], allowedDurations: [SUP_DURATION_MINUTES] };
  }

  const boards = service.staff
    .map((s) => s.staff)
    .filter((s) => s.isActive && (params.forAdmin || s.isVisible));
  if (boards.length === 0) {
    return { slots: [], allowedDurations: [SUP_DURATION_MINUTES] };
  }

  const dayStart = parseTimeOnDate(params.date, "00:00");
  const dayEnd = parseTimeOnDate(params.date, "23:59");
  const boardIds = boards.map((b) => b.id);
  const appointments = await prisma.appointment.findMany({
    where: {
      staffId: { in: boardIds },
      startAt: { gte: dayStart, lte: dayEnd },
      status: { in: ACTIVE_APPOINTMENT_STATUSES },
      ...(params.excludeAppointmentId
        ? { id: { not: params.excludeAppointmentId } }
        : {}),
    },
    select: { staffId: true, startAt: true, endAt: true },
  });

  const wd = weekdayMinsk(params.date);
  const slotStarts = new Set<number>();

  for (const board of boards) {
    const rule = board.schedules.find((r) => r.weekday === wd && r.isWorking);
    if (!rule) continue;

    let windowFrom = rule.timeFrom;
    let windowTo = rule.timeTo;
    if (service.bookableFrom) windowFrom = maxTime(windowFrom, service.bookableFrom);
    if (service.bookableTo) windowTo = minTime(windowTo, service.bookableTo);

    const dayBreaks = board.breaks.filter((b) => b.weekday === null || b.weekday === wd);
    const workIntervals = subtractBreaks(
      parseTimeOnDate(params.date, windowFrom),
      parseTimeOnDate(params.date, windowTo),
      dayBreaks,
      params.date,
    );

    for (const interval of workIntervals) {
      for (
        let t = interval.from.getTime();
        t + SUP_SLOT_STEP * 60_000 <= interval.to.getTime();
        t += SUP_SLOT_STEP * 60_000
      ) {
        slotStarts.add(t);
      }
    }
  }

  const slots: SupSlotDto[] = [...slotStarts]
    .sort((a, b) => a - b)
    .map((t) => {
      const start = new Date(t);
      const end = addMinutes(start, SUP_DURATION_MINUTES);
      let availableBoards = 0;
      for (const board of boards) {
        const rule = board.schedules.find((r) => r.weekday === wd && r.isWorking);
        if (!rule) continue;
        let windowFrom = rule.timeFrom;
        let windowTo = rule.timeTo;
        if (service.bookableFrom) windowFrom = maxTime(windowFrom, service.bookableFrom);
        if (service.bookableTo) windowTo = minTime(windowTo, service.bookableTo);
        const timeStr = formatInTimeZone(start, TZ, "HH:mm");
        const endStr = formatInTimeZone(end, TZ, "HH:mm");
        if (timeStr < windowFrom || endStr > windowTo) continue;
        if (staffFreeForInterval(board.id, start, end, appointments)) {
          availableBoards += 1;
        }
      }
      return {
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        status: availableBoards > 0 ? ("free" as const) : ("busy" as const),
        availableBoards,
      };
    })
    .filter((s) => s.availableBoards > 0);

  return {
    slots: filterPastSlotsForToday(params.date, slots),
    allowedDurations: [SUP_DURATION_MINUTES],
  };
}

export async function countSupAvailableBoards(
  serviceId: string,
  startAt: Date,
  durationMinutes: number = SUP_DURATION_MINUTES,
): Promise<number> {
  const dateStr = formatDateKey(startAt);
  const { slots } = await getSupDaySlots({ serviceId, date: dateStr });
  const match = slots.find(
    (s) => new Date(s.startAt).getTime() === startAt.getTime(),
  );
  return match?.availableBoards ?? 0;
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

export { normalizePhone } from "@/lib/phone";

export type BookingSlotInput = {
  startAt: string;
  quantity?: number;
};

export type CreateBookingInput = {
  organizationId: string;
  serviceId: string;
  staffId?: string;
  startAt?: string;
  durationMinutes?: number;
  quantity?: number;
  slots?: BookingSlotInput[];
  phone: string;
  firstName: string;
  lastName?: string;
  email?: string;
  comment?: string;
  source: "widget" | "admin";
};

async function loadServiceWithRules(serviceId: string) {
  return prisma.service.findUniqueOrThrow({
    where: { id: serviceId },
    include: {
      branch: true,
      priceRules: { orderBy: { sortOrder: "asc" } },
    },
  });
}

function assertServiceBookableForBooking(
  service: Awaited<ReturnType<typeof loadServiceWithRules>>,
  input: CreateBookingInput,
) {
  if (service.branch.organizationId !== input.organizationId) {
    throw new Error("SERVICE_ORG_MISMATCH");
  }
  if (!service.isActive) {
    throw new Error("SERVICE_NOT_BOOKABLE");
  }
  if (input.source === "widget" && !service.isOnlineBookable) {
    throw new Error("SERVICE_NOT_BOOKABLE");
  }
}

function serviceWithRulesDto(service: {
  price: number;
  durationMinutes: number;
  priceRules: { weekdays: string; timeFrom: string; timeTo: string; price: number; sortOrder: number }[];
}) {
  return {
    price: service.price,
    durationMinutes: service.durationMinutes,
    priceRules: service.priceRules as ServicePriceRuleDto[],
  };
}

export async function createBooking(
  input: CreateBookingInput,
  opts?: { skipSlotCheck?: boolean },
): Promise<{ id: string; publicNumber: number; price: number; count?: number }> {
  const service = await loadServiceWithRules(input.serviceId);
  assertServiceBookableForBooking(service, input);

  if (input.slots?.length) {
    return createBatchBooking(input, service, opts);
  }

  const isSup = service.kind === "sup";

  if (isSup) {
    if (!input.startAt) throw new Error("INVALID_SLOT");
    return createSupBooking(input as CreateBookingInput & { startAt: string }, service, opts);
  }

  if (!input.staffId) throw new Error("STAFF_REQUIRED");
  if (!input.startAt) throw new Error("INVALID_SLOT");

  const startAtStr = input.startAt;

  const allowed = parseDurations(service.allowedDurations);
  const duration =
    input.source === "admin" && input.durationMinutes != null
      ? normalizeAdminDuration(input.durationMinutes)
      : (input.durationMinutes ?? allowed[0] ?? service.durationMinutes);
  if (input.source !== "admin" && !allowed.includes(duration)) {
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

  const client = await upsertClientByPhone({
    organizationId: input.organizationId,
    phone: input.phone,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
  });

  const price = resolveServicePrice(serviceWithRulesDto(service), startAt, duration);
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
    return { id: appt.id, publicNumber, price };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("SLOT_UNAVAILABLE");
    }
    throw e;
  }
}

async function isWakeCellFree(params: {
  serviceId: string;
  staffId: string;
  startAt: Date;
}): Promise<boolean> {
  const dateStr = formatDateKey(params.startAt);
  const { slots } = await getDaySlots({
    serviceId: params.serviceId,
    staffId: params.staffId,
    date: dateStr,
  });
  const t = params.startAt.getTime();
  return slots.some(
    (s) => new Date(s.startAt).getTime() === t && s.status === "free",
  );
}

async function createSupBooking(
  input: CreateBookingInput & { startAt: string },
  service: Awaited<ReturnType<typeof loadServiceWithRules>>,
  opts?: { skipSlotCheck?: boolean },
) {
  const quantity = input.quantity ?? 1;
  if (quantity < 1) throw new Error("INVALID_QUANTITY");

  const duration = SUP_DURATION_MINUTES;
  const startAt = new Date(input.startAt);
  const endAt = addMinutes(startAt, duration);

  if (!opts?.skipSlotCheck) {
    const available = await countSupAvailableBoards(service.id, startAt, duration);
    if (available < quantity) throw new Error("SLOT_UNAVAILABLE");
  }

  const boards = await prisma.staff.findMany({
    where: {
      isActive: true,
      isVisible: true,
      services: { some: { serviceId: service.id } },
    },
    orderBy: { sortOrder: "asc" },
  });

  const dayStart = parseTimeOnDate(formatDateKey(startAt), "00:00");
  const dayEnd = parseTimeOnDate(formatDateKey(startAt), "23:59");
  const appointments = await prisma.appointment.findMany({
    where: {
      staffId: { in: boards.map((b) => b.id) },
      startAt: { gte: dayStart, lte: dayEnd },
      status: { in: ACTIVE_APPOINTMENT_STATUSES },
    },
    select: { staffId: true, startAt: true, endAt: true },
  });

  const freeBoards = boards.filter((b) =>
    staffFreeForInterval(b.id, startAt, endAt, appointments),
  );
  if (freeBoards.length < quantity) throw new Error("SLOT_UNAVAILABLE");

  const selected = freeBoards.slice(0, quantity);
  const unitPrice = resolveServicePrice(serviceWithRulesDto(service), startAt, duration);
  const totalPrice = Math.round(unitPrice * quantity * 100) / 100;
  const publicNumber = await nextPublicNumber();
  const bookingGroupId = randomUUID();

  const client = await upsertClientByPhone({
    organizationId: input.organizationId,
    phone: input.phone,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
  });

  try {
    const created = await prisma.$transaction(
      selected.map((board, i) =>
        prisma.appointment.create({
          data: {
            publicNumber: i === 0 ? publicNumber : null,
            organizationId: input.organizationId,
            branchId: service.branchId,
            clientId: client.id,
            staffId: board.id,
            serviceId: service.id,
            startAt,
            endAt,
            durationMinutes: duration,
            price: i === 0 ? totalPrice : 0,
            status: "booked",
            source: input.source,
            comment: input.comment,
            bookingGroupId,
          },
        }),
      ),
    );
    return { id: created[0].id, publicNumber, price: totalPrice };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("SLOT_UNAVAILABLE");
    }
    throw e;
  }
}

const WAKE_CELL_MINUTES = 10;

async function createBatchBooking(
  input: CreateBookingInput,
  service: Awaited<ReturnType<typeof loadServiceWithRules>>,
  opts?: { skipSlotCheck?: boolean },
): Promise<{ id: string; publicNumber: number; price: number; count: number }> {
  const slots = input.slots!;
  const isSup = service.kind === "sup";
  const cellMinutes = isSup ? SUP_DURATION_MINUTES : WAKE_CELL_MINUTES;

  if (!isSup && !input.staffId) throw new Error("STAFF_REQUIRED");

  const client = await upsertClientByPhone({
    organizationId: input.organizationId,
    phone: input.phone,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
  });

  const publicNumber = await nextPublicNumber();
  const bookingGroupId = slots.length > 1 ? randomUUID() : undefined;
  const serviceDto = serviceWithRulesDto(service);
  const sorted = [...slots].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );

  let totalPrice = 0;
  const rows: {
    staffId: string;
    startAt: Date;
    endAt: Date;
    durationMinutes: number;
    price: number;
  }[] = [];

  for (const slot of sorted) {
    const startAt = new Date(slot.startAt);
    const endAt = addMinutes(startAt, cellMinutes);
    const quantity = slot.quantity ?? 1;

    if (isSup) {
      if (!opts?.skipSlotCheck) {
        const available = await countSupAvailableBoards(
          service.id,
          startAt,
          cellMinutes,
        );
        if (available < quantity) throw new Error("SLOT_UNAVAILABLE");
      }

      const boards = await prisma.staff.findMany({
        where: {
          isActive: true,
          isVisible: true,
          services: { some: { serviceId: service.id } },
        },
        orderBy: { sortOrder: "asc" },
      });

      const dayStart = parseTimeOnDate(formatDateKey(startAt), "00:00");
      const dayEnd = parseTimeOnDate(formatDateKey(startAt), "23:59");
      const appointments = await prisma.appointment.findMany({
        where: {
          staffId: { in: boards.map((b) => b.id) },
          startAt: { gte: dayStart, lte: dayEnd },
          status: { in: ACTIVE_APPOINTMENT_STATUSES },
        },
        select: { staffId: true, startAt: true, endAt: true },
      });

      const freeBoards = boards.filter((b) =>
        staffFreeForInterval(b.id, startAt, endAt, appointments),
      );
      if (freeBoards.length < quantity) throw new Error("SLOT_UNAVAILABLE");

      const unitPrice = resolveServicePrice(serviceDto, startAt, cellMinutes);
      const slotTotal = Math.round(unitPrice * quantity * 100) / 100;
      totalPrice += slotTotal;

      freeBoards.slice(0, quantity).forEach((board, i) => {
        rows.push({
          staffId: board.id,
          startAt,
          endAt,
          durationMinutes: cellMinutes,
          price: i === 0 ? slotTotal : 0,
        });
      });
    } else {
      if (!opts?.skipSlotCheck) {
        const ok = await isWakeCellFree({
          serviceId: input.serviceId,
          staffId: input.staffId!,
          startAt,
        });
        if (!ok) throw new Error("SLOT_UNAVAILABLE");
      }

      const price = resolveServicePrice(serviceDto, startAt, cellMinutes);
      totalPrice += price;
      rows.push({
        staffId: input.staffId!,
        startAt,
        endAt,
        durationMinutes: cellMinutes,
        price,
      });
    }
  }

  try {
    const created = await prisma.$transaction(
      rows.map((row, i) =>
        prisma.appointment.create({
          data: {
            publicNumber: i === 0 ? publicNumber : null,
            organizationId: input.organizationId,
            branchId: service.branchId,
            clientId: client.id,
            staffId: row.staffId,
            serviceId: service.id,
            startAt: row.startAt,
            endAt: row.endAt,
            durationMinutes: row.durationMinutes,
            price: row.price,
            status: "booked",
            source: input.source,
            comment: input.comment,
            bookingGroupId,
          },
        }),
      ),
    );
    return {
      id: created[0].id,
      publicNumber,
      price: Math.round(totalPrice * 100) / 100,
      count: sorted.length,
    };
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

  if (staff.kind === "sup") {
    return candidates.find((s) => s.kind === "sup")?.id ?? candidates[0].id;
  }

  return candidates.find((s) => s.kind === "wake")?.id ?? candidates[0].id;
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
    price?: number;
    paymentMethod?: string | null;
  },
  opts?: { skipSlotCheck?: boolean; db?: DbClient },
) {
  const db = opts?.db ?? prisma;
  const existing = await db.appointment.findUniqueOrThrow({
    where: { id },
    include: { client: true, service: true },
  });

  let clientId = existing.clientId;
  if (data.phone || data.firstName !== undefined || data.lastName !== undefined) {
    const client = await upsertClientByPhone({
      organizationId: existing.organizationId,
      phone: data.phone ?? existing.client.phone,
      firstName: data.firstName ?? existing.client.firstName ?? "",
      lastName:
        data.lastName !== undefined ? data.lastName : existing.client.lastName,
      email: existing.client.email,
    });
    clientId = client.id;
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

  const service = await db.service.findUniqueOrThrow({
    where: { id: serviceId },
    include: { priceRules: { orderBy: { sortOrder: "asc" } } },
  });
  const rawDuration = data.durationMinutes ?? existing.durationMinutes;
  const duration = opts?.skipSlotCheck
    ? normalizeAdminDuration(rawDuration)
    : normalizeDurationForService(service, rawDuration);
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

  const price =
    data.price ??
    resolveServicePrice(serviceWithRulesDto(service), startAt, duration);

  try {
    return await db.appointment.update({
      where: { id },
      data: {
        clientId,
        staffId,
        serviceId,
        startAt,
        endAt,
        durationMinutes: duration,
        price,
        status: data.status,
        comment: data.comment,
        ...(data.paymentMethod !== undefined
          ? { paymentMethod: data.paymentMethod }
          : {}),
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
