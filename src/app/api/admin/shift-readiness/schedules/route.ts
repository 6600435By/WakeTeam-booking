import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canEditShiftReadiness,
  handleAdminError,
  requireAdminContext,
  resolveManagementBranchFilter,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { weekdayMinsk } from "@/lib/time";
import { logScheduleBranch, logScheduleResource } from "@/lib/audit/shift-audit";

const resourceSchema = z.object({
  branchId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staffId: z.string(),
  isWorking: z.boolean(),
  timeFrom: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timeTo: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

const branchHoursSchema = z.object({
  action: z.literal("branch-hours"),
  branchId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeFrom: z.string().regex(/^\d{2}:\d{2}$/),
  timeTo: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const body = await req.json();

    if (body?.action === "branch-hours") {
      const parsed = branchHoursSchema.parse(body);
      const branchId = resolveManagementBranchFilter(ctx, parsed.branchId);
      if (!branchId) {
        return NextResponse.json({ error: "Укажите филиал" }, { status: 400 });
      }
      if (!canEditShiftReadiness(ctx, branchId)) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      const weekday = weekdayMinsk(parsed.date);
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { name: true },
      });
      const reverses = await prisma.staff.findMany({
        where: { branchId, kind: "revers", isActive: true },
        select: { id: true },
      });
      const firstReverse = reverses[0];
      let prevFrom: string | null = null;
      let prevTo: string | null = null;
      if (firstReverse) {
        const prev = await prisma.staffSchedule.findUnique({
          where: { staffId_weekday: { staffId: firstReverse.id, weekday } },
        });
        if (prev?.isWorking) {
          prevFrom = prev.timeFrom;
          prevTo = prev.timeTo;
        }
      }
      for (const staff of reverses) {
        await prisma.staffSchedule.upsert({
          where: { staffId_weekday: { staffId: staff.id, weekday } },
          create: {
            staffId: staff.id,
            weekday,
            isWorking: true,
            timeFrom: parsed.timeFrom,
            timeTo: parsed.timeTo,
          },
          update: {
            isWorking: true,
            timeFrom: parsed.timeFrom,
            timeTo: parsed.timeTo,
          },
        });
      }
      logScheduleBranch(ctx, {
        branchId,
        branchName: branch?.name ?? "филиал",
        timeFrom: parsed.timeFrom,
        timeTo: parsed.timeTo,
        prevFrom,
        prevTo,
      });
      return NextResponse.json({ ok: true });
    }

    const parsed = resourceSchema.parse(body);
    const branchId = resolveManagementBranchFilter(ctx, parsed.branchId);
    if (!branchId) {
      return NextResponse.json({ error: "Укажите филиал" }, { status: 400 });
    }
    if (!canEditShiftReadiness(ctx, branchId)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const staff = await prisma.staff.findFirst({
      where: { id: parsed.staffId, branchId, kind: "revers" },
      select: { id: true, name: true },
    });
    if (!staff) {
      return NextResponse.json({ error: "Ресурс не найден" }, { status: 404 });
    }
    const weekday = weekdayMinsk(parsed.date);
    if (!parsed.isWorking) {
      await prisma.staffSchedule.upsert({
        where: { staffId_weekday: { staffId: parsed.staffId, weekday } },
        create: {
          staffId: parsed.staffId,
          weekday,
          isWorking: false,
          timeFrom: "10:00",
          timeTo: "22:00",
        },
        update: { isWorking: false },
      });
    } else {
      const timeFrom = parsed.timeFrom ?? "10:00";
      const timeTo = parsed.timeTo ?? "22:00";
      await prisma.staffSchedule.upsert({
        where: { staffId_weekday: { staffId: parsed.staffId, weekday } },
        create: {
          staffId: parsed.staffId,
          weekday,
          isWorking: true,
          timeFrom,
          timeTo,
        },
        update: { isWorking: true, timeFrom, timeTo },
      });
    }
    logScheduleResource(ctx, {
      branchId,
      staffName: staff.name,
      isWorking: parsed.isWorking,
      timeFrom: parsed.timeFrom,
      timeTo: parsed.timeTo,
    });
    return NextResponse.json({ ok: true });
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
