import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCatalogAccess,
  assertStaffAccess,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import {
  effectiveScheduleRule,
  getWeekdayScheduleRule,
} from "@/lib/staff-schedule-effective";
import { prisma } from "@/lib/db";
import { weekdayMinsk } from "@/lib/time";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const patchSchema = z.object({
  isWorking: z.boolean(),
  timeFrom: z.string(),
  timeTo: z.string(),
  useWeekdayDefault: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertCatalogAccess(ctx);
    const { id } = await params;
    await assertStaffAccess(ctx, id);

    const date = dateSchema.parse(req.nextUrl.searchParams.get("date"));
    const weekday = weekdayMinsk(date);

    const staff = await prisma.staff.findUnique({
      where: { id },
      include: { schedules: true },
    });
    if (!staff) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const override = await prisma.staffScheduleOverride.findUnique({
      where: { staffId_date: { staffId: id, date } },
    });

    const weekdayRule = getWeekdayScheduleRule(staff.schedules, weekday);
    const effective = effectiveScheduleRule(staff.schedules, override, weekday);

    return NextResponse.json({
      staffName: staff.name,
      date,
      weekday,
      isOverride: Boolean(override),
      override,
      weekdayRule: weekdayRule ?? null,
      effective: effective
        ? {
            isWorking: effective.isWorking,
            timeFrom: effective.timeFrom,
            timeTo: effective.timeTo,
          }
        : { isWorking: false, timeFrom: "10:00", timeTo: "18:00" },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertCatalogAccess(ctx);
    const { id } = await params;
    await assertStaffAccess(ctx, id);

    const date = dateSchema.parse(req.nextUrl.searchParams.get("date"));
    const body = patchSchema.parse(await req.json());

    if (body.useWeekdayDefault) {
      await prisma.staffScheduleOverride.deleteMany({
        where: { staffId: id, date },
      });
      return NextResponse.json({ ok: true, cleared: true });
    }

    await prisma.staffScheduleOverride.upsert({
      where: { staffId_date: { staffId: id, date } },
      create: {
        staffId: id,
        date,
        isWorking: body.isWorking,
        timeFrom: body.timeFrom,
        timeTo: body.timeTo,
      },
      update: {
        isWorking: body.isWorking,
        timeFrom: body.timeFrom,
        timeTo: body.timeTo,
      },
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
