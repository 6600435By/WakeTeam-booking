import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertMemberAccess,
  canEditShiftCalendar,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import { getBranchPlannedWindow } from "@/lib/payroll/branch-planned-window";
import { validateShiftSchedule } from "@/lib/payroll/shift-schedule";

const createSchema = z.object({
  branchId: z.string(),
  memberId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  plannedEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  plannedStaffId: z.string().optional(),
  workAsAdmin: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    if (!canEditShiftCalendar(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId");
    const date = searchParams.get("date");
    if (!branchId || !date) {
      return NextResponse.json({ error: "Укажите филиал и дату" }, { status: 400 });
    }
    const planned = await getBranchPlannedWindow(branchId, date);
    return NextResponse.json({
      plannedStart: planned.start ?? "10:00",
      plannedEnd: planned.end ?? "22:00",
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    if (!canEditShiftCalendar(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const body = createSchema.parse(await req.json());

    const member = await assertMemberAccess(ctx, body.memberId);
    const schedule = await validateShiftSchedule(
      body.branchId,
      member.id,
      body.plannedStaffId,
      body.workAsAdmin,
    );
    if ("error" in schedule) {
      return NextResponse.json({ error: schedule.error }, { status: 400 });
    }

    const existing = await prisma.workShift.findUnique({
      where: { memberId_date: { memberId: body.memberId, date: body.date } },
    });
    if (existing) {
      if (existing.status === "scheduled") {
        return NextResponse.json(
          { error: "Смена уже запланирована — отредактируйте существующую" },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "У сотрудника уже есть смена на этот день" },
        { status: 400 },
      );
    }

    const planned = await getBranchPlannedWindow(body.branchId, body.date);
    const shift = await prisma.workShift.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: body.branchId,
        memberId: body.memberId,
        date: body.date,
        plannedStart: body.plannedStart ?? planned.start ?? "10:00",
        plannedEnd: body.plannedEnd ?? planned.end ?? "22:00",
        plannedStaffId: schedule.plannedStaffId,
        workAsAdmin: schedule.workAsAdmin,
        status: "scheduled",
      },
      include: {
        member: {
          include: { user: { select: { name: true, lastName: true, login: true, email: true } } },
        },
        plannedStaff: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      shift: {
        id: shift.id,
        memberId: shift.memberId,
        memberName: staffDisplayName(shift.member.user),
        date: shift.date,
        plannedStart: shift.plannedStart,
        plannedEnd: shift.plannedEnd,
        plannedStaffId: shift.plannedStaffId,
        plannedStaffName: shift.plannedStaff?.name ?? null,
        workAsAdmin: shift.workAsAdmin,
        status: shift.status,
      },
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
