import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertBranchAccess,
  assertBranchSettingsAccess,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import {
  deleteBranchHoliday,
  ensureBranchWeekdaySchedules,
  listBranchHolidays,
  saveBranchWeekdaySchedules,
  upsertBranchHoliday,
  assertValidBranchScheduleTimes,
} from "@/lib/branch-hours";
import { timeToMinutes } from "@/lib/calendar-grid";

const weekdaySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  isWorking: z.boolean(),
  timeFrom: z.string().regex(/^\d{2}:\d{2}$/),
  timeTo: z.string().regex(/^\d{2}:\d{2}$/),
});

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().nullable().optional(),
  isWorking: z.boolean().optional(),
  timeFrom: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  timeTo: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

const patchSchema = z.object({
  weekdaySchedules: z.array(weekdaySchema).optional(),
  holiday: holidaySchema.optional(),
  deleteHolidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  syncStaff: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertBranchSettingsAccess(ctx);
    const { id } = await params;
    assertBranchAccess(ctx, id);

    const weekdaySchedules = await ensureBranchWeekdaySchedules(id);
    const holidays = await listBranchHolidays(id);

    return NextResponse.json({ weekdaySchedules, holidays });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertBranchSettingsAccess(ctx);
    const { id } = await params;
    assertBranchAccess(ctx, id);
    const body = patchSchema.parse(await req.json());

    if (body.weekdaySchedules) {
      await saveBranchWeekdaySchedules(id, body.weekdaySchedules, {
        syncStaff: body.syncStaff !== false,
      });
    }

    if (body.holiday) {
      const holiday = body.holiday;
      if (
        holiday.isWorking !== false &&
        holiday.timeFrom &&
        holiday.timeTo &&
        timeToMinutes(holiday.timeFrom) >= timeToMinutes(holiday.timeTo)
      ) {
        return NextResponse.json(
          { error: "Время начала праздника должно быть раньше окончания" },
          { status: 400 },
        );
      }
      await upsertBranchHoliday(id, body.holiday);
    }

    if (body.deleteHolidayDate) {
      await deleteBranchHoliday(id, body.deleteHolidayDate);
    }

    const weekdaySchedules = await ensureBranchWeekdaySchedules(id);
    const holidays = await listBranchHolidays(id);

    return NextResponse.json({ ok: true, weekdaySchedules, holidays });
  } catch (e) {
    if (e instanceof Error && /время начала/i.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof z.ZodError) {
      const first = e.issues[0];
      return NextResponse.json(
        { error: first?.message ?? "Некорректные данные" },
        { status: 400 },
      );
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
