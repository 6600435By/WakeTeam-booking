import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertMemberAccess,
  assertShiftScheduleWrite,
  canEditShiftReadiness,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import { logShiftAssign } from "@/lib/audit/shift-audit";
import { setShiftPlannedReverses, resolvePlannedReverseIds, activatePlannedReversesOnOpen } from "@/lib/payroll/shift-planned-reverses";
import { validateShiftSchedule } from "@/lib/payroll/shift-schedule";

const patchSchema = z.object({
  memberId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  plannedStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  plannedEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  plannedStaffId: z.string().nullable().optional(),
  plannedStaffIds: z.array(z.string()).optional(),
  workAsAdmin: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const shift = await prisma.workShift.findUnique({
      where: { id },
      include: { member: { select: { role: true } } },
    });
    if (!shift || shift.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    if (shift.status !== "scheduled" && shift.status !== "open") {
      return NextResponse.json(
        { error: "Редактировать можно только запланированные или открытые смены" },
        { status: 400 },
      );
    }

    const nextMemberId = body.memberId ?? shift.memberId;
    const nextDate = body.date ?? shift.date;
    const nextWorkAsAdmin = body.workAsAdmin ?? shift.workAsAdmin;
    const hasStaffIdsUpdate = body.plannedStaffIds !== undefined;
    const hasStaffIdUpdate = body.plannedStaffId !== undefined;
    const nextPlannedStaffId = hasStaffIdUpdate
      ? body.plannedStaffId
      : shift.plannedStaffId;
    let staffIdsForValidation: string[] | undefined;
    if (hasStaffIdsUpdate) {
      staffIdsForValidation = body.plannedStaffIds ?? [];
    } else if (hasStaffIdUpdate) {
      staffIdsForValidation = body.plannedStaffId ? [body.plannedStaffId] : [];
    } else {
      staffIdsForValidation = await resolvePlannedReverseIds(shift.id, shift.plannedStaffId);
    }

    if (body.memberId) {
      await assertMemberAccess(ctx, body.memberId);
    }

    const targetMember = await prisma.organizationMember.findUnique({
      where: { id: nextMemberId },
      select: { role: true },
    });
    assertShiftScheduleWrite(ctx, {
      date: nextDate,
      branchId: shift.branchId,
      targetMemberRole: targetMember?.role ?? null,
    });

    const schedule = await validateShiftSchedule(
      shift.branchId,
      nextMemberId,
      nextPlannedStaffId,
      nextWorkAsAdmin,
      staffIdsForValidation,
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
        panelOnly: false,
      },
      include: {
        member: {
          include: {
            user: { select: { name: true, lastName: true, login: true, email: true } },
          },
        },
        plannedStaff: { select: { id: true, name: true } },
      },
    });

    const staffIds =
      hasStaffIdsUpdate || hasStaffIdUpdate
        ? await setShiftPlannedReverses(id, schedule.plannedStaffIds)
        : staffIdsForValidation ?? schedule.plannedStaffIds;

    if (shift.status === "open") {
      await activatePlannedReversesOnOpen(
        id,
        schedule.plannedStaffId,
        shift.actualStart ?? new Date(),
      );
    }

    const names = staffIds.length
      ? await prisma.staff.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(names.map((n) => [n.id, n.name]));
    const staffNameList = staffIds.map((sid) => nameById.get(sid) ?? sid);

    logShiftAssign(ctx, {
      shiftId: updated.id,
      branchId: shift.branchId,
      memberName: staffDisplayName(updated.member.user),
      staffNames: staffNameList,
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
        plannedStaffIds: staffIds,
        plannedStaffNames: staffNameList,
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
    const { id } = await params;
    const shift = await prisma.workShift.findUnique({
      where: { id },
      include: {
        member: {
          include: {
            user: { select: { name: true, lastName: true, login: true, email: true } },
          },
        },
      },
    });
    if (!shift || shift.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    if (shift.status !== "scheduled" && shift.status !== "open") {
      return NextResponse.json(
        { error: "Удалить можно только запланированную или открытую смену" },
        { status: 400 },
      );
    }
    if (!canEditShiftReadiness(ctx, shift.branchId)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    assertShiftScheduleWrite(ctx, {
      date: shift.date,
      branchId: shift.branchId,
      targetMemberRole: shift.member.role,
    });
    logShiftAssign(ctx, {
      shiftId: shift.id,
      branchId: shift.branchId,
      memberName: staffDisplayName(shift.member.user),
      staffNames: ["снято"],
    });
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
