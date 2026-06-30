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
import { validateShiftSchedule } from "@/lib/payroll/shift-schedule";

const patchSchema = z.object({
  memberId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  plannedStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  plannedEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  plannedStaffId: z.string().nullable().optional(),
  workAsAdmin: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    if (!canEditShiftCalendar(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const shift = await prisma.workShift.findUnique({ where: { id } });
    if (!shift || shift.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    if (shift.status !== "scheduled") {
      return NextResponse.json(
        { error: "Редактировать можно только запланированные смены" },
        { status: 400 },
      );
    }

    const nextMemberId = body.memberId ?? shift.memberId;
    const nextDate = body.date ?? shift.date;
    const nextWorkAsAdmin = body.workAsAdmin ?? shift.workAsAdmin;
    const nextPlannedStaffId =
      body.plannedStaffId !== undefined ? body.plannedStaffId : shift.plannedStaffId;

    if (body.memberId) {
      await assertMemberAccess(ctx, body.memberId);
    }

    const schedule = await validateShiftSchedule(
      shift.branchId,
      nextMemberId,
      nextPlannedStaffId ?? undefined,
      nextWorkAsAdmin,
    );
    if ("error" in schedule) {
      return NextResponse.json({ error: schedule.error }, { status: 400 });
    }

    if (nextMemberId !== shift.memberId || nextDate !== shift.date) {
      const conflict = await prisma.workShift.findUnique({
        where: { memberId_date: { memberId: nextMemberId, date: nextDate } },
      });
      if (conflict && conflict.id !== id) {
        return NextResponse.json(
          { error: "У сотрудника уже есть смена на эту дату" },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.workShift.update({
      where: { id },
      data: {
        memberId: nextMemberId,
        date: nextDate,
        plannedStart: body.plannedStart ?? shift.plannedStart,
        plannedEnd: body.plannedEnd ?? shift.plannedEnd,
        plannedStaffId: schedule.plannedStaffId,
        workAsAdmin: schedule.workAsAdmin,
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
        id: updated.id,
        memberId: updated.memberId,
        memberName: staffDisplayName(updated.member.user),
        date: updated.date,
        plannedStart: updated.plannedStart,
        plannedEnd: updated.plannedEnd,
        plannedStaffId: updated.plannedStaffId,
        plannedStaffName: updated.plannedStaff?.name ?? null,
        workAsAdmin: updated.workAsAdmin,
        status: updated.status,
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    if (!canEditShiftCalendar(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const { id } = await params;
    const shift = await prisma.workShift.findUnique({ where: { id } });
    if (!shift || shift.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    if (shift.status !== "scheduled") {
      return NextResponse.json(
        { error: "Удалить можно только запланированную смену" },
        { status: 400 },
      );
    }
    await prisma.workShift.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
