import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canEditShiftReadiness,
  handleAdminError,
  requireAdminContext,
  resolveManagementBranchFilter,
} from "@/lib/admin-access";
import { parseServiceWeekdays } from "@/lib/admin/service-staff-schedule";
import { prisma } from "@/lib/db";
import { weekdayMinsk } from "@/lib/time";
import { logScheduleService } from "@/lib/audit/shift-audit";

function weekdaysWithDay(weekdays: string, weekday: number, working: boolean): string {
  const set = parseServiceWeekdays(weekdays);
  if (working) set.add(weekday);
  else set.delete(weekday);
  return [...set].sort((a, b) => a - b).join(",");
}

function serviceAvailableToday(
  weekdays: string,
  weekday: number,
  isActive: boolean,
): boolean {
  return isActive && parseServiceWeekdays(weekdays).has(weekday);
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const branchId = resolveManagementBranchFilter(
      ctx,
      req.nextUrl.searchParams.get("branchId"),
    );
    const date = req.nextUrl.searchParams.get("date");
    if (!branchId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Укажите филиал и дату" }, { status: 400 });
    }
    if (!canEditShiftReadiness(ctx, branchId)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const weekday = weekdayMinsk(date);
    const services = await prisma.service.findMany({
      where: { branchId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        kind: true,
        bookableFrom: true,
        bookableTo: true,
        weekdays: true,
        isActive: true,
        isOnlineBookable: true,
      },
    });

    return NextResponse.json({
      date,
      weekday,
      services: services.map((s) => ({
        ...s,
        availableToday: serviceAvailableToday(s.weekdays, weekday, s.isActive),
        workingToday: parseServiceWeekdays(s.weekdays).has(weekday),
      })),
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

const patchSchema = z.object({
  branchId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceId: z.string(),
  workingToday: z.boolean().optional(),
  bookableFrom: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  bookableTo: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional(),
  isOnlineBookable: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const body = patchSchema.parse(await req.json());
    const branchId = resolveManagementBranchFilter(ctx, body.branchId);
    if (!branchId) {
      return NextResponse.json({ error: "Укажите филиал" }, { status: 400 });
    }
    if (!canEditShiftReadiness(ctx, branchId)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const service = await prisma.service.findFirst({
      where: { id: body.serviceId, branchId },
      include: { staff: { select: { staffId: true } } },
    });
    if (!service) {
      return NextResponse.json({ error: "Услуга не найдена" }, { status: 404 });
    }

    const weekday = weekdayMinsk(body.date);
    const data: {
      weekdays?: string;
      bookableFrom?: string | null;
      bookableTo?: string | null;
      isActive?: boolean;
      isOnlineBookable?: boolean;
    } = {};

    if (body.workingToday !== undefined) {
      data.weekdays = weekdaysWithDay(service.weekdays, weekday, body.workingToday);
    }
    if (body.bookableFrom !== undefined) data.bookableFrom = body.bookableFrom;
    if (body.bookableTo !== undefined) data.bookableTo = body.bookableTo;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.isOnlineBookable !== undefined) data.isOnlineBookable = body.isOnlineBookable;

    const updated = await prisma.service.update({
      where: { id: service.id },
      data,
      select: {
        id: true,
        name: true,
        kind: true,
        bookableFrom: true,
        bookableTo: true,
        weekdays: true,
        isActive: true,
        isOnlineBookable: true,
      },
    });

    const scheduleTouched =
      body.workingToday !== undefined ||
      body.bookableFrom !== undefined ||
      body.bookableTo !== undefined;

    if (scheduleTouched && service.staff.length > 0) {
      const { buildStaffSchedulesFromService } = await import(
        "@/lib/admin/service-staff-schedule"
      );
      const schedules = buildStaffSchedulesFromService(
        updated.weekdays,
        updated.bookableFrom,
        updated.bookableTo,
      );
      for (const link of service.staff) {
        for (const s of schedules) {
          await prisma.staffSchedule.upsert({
            where: { staffId_weekday: { staffId: link.staffId, weekday: s.weekday } },
            create: { staffId: link.staffId, ...s },
            update: s,
          });
        }
      }
    }

    const logParts: string[] = [];
    if (body.bookableFrom !== undefined || body.bookableTo !== undefined) {
      logParts.push(
        `окно ${updated.bookableFrom ?? "—"}–${updated.bookableTo ?? "—"}`,
      );
    }
    if (body.workingToday !== undefined) {
      logParts.push(body.workingToday ? "работает сегодня" : "не работает сегодня");
    }
    if (body.isOnlineBookable !== undefined) {
      logParts.push(body.isOnlineBookable ? "онлайн вкл" : "онлайн выкл");
    }
    if (body.isActive !== undefined) {
      logParts.push(updated.isActive ? "активна" : "неактивна");
    }
    if (logParts.length > 0) {
      logScheduleService(ctx, {
        branchId,
        serviceName: updated.name,
        parts: logParts,
      });
    }

    return NextResponse.json({
      ok: true,
      service: {
        ...updated,
        availableToday: serviceAvailableToday(
          updated.weekdays,
          weekday,
          updated.isActive,
        ),
        workingToday: parseServiceWeekdays(updated.weekdays).has(weekday),
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
