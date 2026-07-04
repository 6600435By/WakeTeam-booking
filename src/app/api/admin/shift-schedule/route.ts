import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertMemberAccess,
  assertShiftScheduleWrite,
  canAssignShiftOnDuty,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import { logShiftAssign } from "@/lib/audit/shift-audit";
import { getBranchPlannedWindow } from "@/lib/payroll/branch-planned-window";
import { setShiftPlannedReverses } from "@/lib/payroll/shift-planned-reverses";
import { validateShiftSchedule } from "@/lib/payroll/shift-schedule";

const createSchema = z.object({
  branchId: z.string(),
  memberId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  plannedEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  plannedStaffId: z.string().optional(),
  plannedStaffIds: z.array(z.string()).optional(),
  workAsAdmin: z.boolean().optional(),
});

function formatShiftResponse(
  shift: {
    id: string;
    memberId: string;
    date: string;
    plannedStart: string | null;
    plannedEnd: string | null;
    plannedStaffId: string | null;
    workAsAdmin: boolean;
    status: string;
    member: {
      user: { name: string | null; lastName: string | null; login: string; email: string | null };
    };
    plannedStaff: { id: string; name: string } | null;
  },
  plannedStaffIds: string[],
  plannedStaffNames: string[],
) {
  return {
    id: shift.id,
    memberId: shift.memberId,
    memberName: staffDisplayName(shift.member.user),
    date: shift.date,
    plannedStart: shift.plannedStart,
    plannedEnd: shift.plannedEnd,
    plannedStaffId: shift.plannedStaffId,
    plannedStaffName: shift.plannedStaff?.name ?? null,
    plannedStaffIds,
    plannedStaffNames,
    workAsAdmin: shift.workAsAdmin,
    status: shift.status,
  };
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    if (!canAssignShiftOnDuty(ctx)) {
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
    const body = createSchema.parse(await req.json());

    const member = await assertMemberAccess(ctx, body.memberId);
    const targetMember = await prisma.organizationMember.findUnique({
      where: { id: member.id },
      select: { role: true },
    });
    assertShiftScheduleWrite(ctx, {
      date: body.date,
      branchId: body.branchId,
      targetMemberRole: targetMember?.role ?? null,
    });
    const schedule = await validateShiftSchedule(
      body.branchId,
      member.id,
      body.plannedStaffId,
      body.workAsAdmin,
      body.plannedStaffIds,
    );
    if ("error" in schedule) {
      return NextResponse.json({ error: schedule.error }, { status: 400 });
    }

    const existing = await prisma.workShift.findUnique({
      where: { memberId_date: { memberId: body.memberId, date: body.date } },
    });
    if (existing) {
      if (existing.status !== "scheduled") {
        return NextResponse.json(
          { error: "У сотрудника уже есть смена на этот день" },
          { status: 400 },
        );
      }
      const planned = await getBranchPlannedWindow(body.branchId, body.date);
      const updated = await prisma.workShift.update({
        where: { id: existing.id },
        data: {
          plannedStart: body.plannedStart ?? existing.plannedStart ?? planned.start ?? "10:00",
          plannedEnd: body.plannedEnd ?? existing.plannedEnd ?? planned.end ?? "22:00",
          plannedStaffId: schedule.plannedStaffId,
          workAsAdmin: schedule.workAsAdmin,
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
      const staffIds = await setShiftPlannedReverses(existing.id, schedule.plannedStaffIds);
      const names = await prisma.staff.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, name: true },
      });
      const nameById = new Map(names.map((n) => [n.id, n.name]));
      const staffNameList = staffIds.map((id) => nameById.get(id) ?? id);
      logShiftAssign(ctx, {
        shiftId: updated.id,
        branchId: body.branchId,
        memberName: staffDisplayName(updated.member.user),
        staffNames: staffNameList,
      });
      return NextResponse.json({
        shift: formatShiftResponse(
          updated,
          staffIds,
          staffNameList,
        ),
      });
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
          include: {
            user: { select: { name: true, lastName: true, login: true, email: true } },
          },
        },
        plannedStaff: { select: { id: true, name: true } },
      },
    });
    const staffIds = await setShiftPlannedReverses(shift.id, schedule.plannedStaffIds);
    const names = await prisma.staff.findMany({
      where: { id: { in: staffIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(names.map((n) => [n.id, n.name]));
    const staffNameList = staffIds.map((id) => nameById.get(id) ?? id);
    logShiftAssign(ctx, {
      shiftId: shift.id,
      branchId: body.branchId,
      memberName: staffDisplayName(shift.member.user),
      staffNames: staffNameList,
    });

    return NextResponse.json({
      shift: formatShiftResponse(
        shift,
        staffIds,
        staffNameList,
      ),
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
