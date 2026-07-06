import type { WorkShift } from "@prisma/client";
import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import { BRANCH_OPERATOR_ROLE, SUPER_ADMIN_ROLE, BRANCH_ADMIN_ROLE, BRANCH_MANAGER_ROLE, parseAdminRole } from "@/lib/admin-access";
import { parseTimeOnDate } from "@/lib/time";
import { getBranchPlannedWindow } from "./branch-planned-window";
import { listBaselineTasksForDay } from "./shift-baseline-tasks";
import { getChecklistForShift } from "./shift-checklist";
import { calcPanelMinutes, calcInServicePanelMinutes, countInServiceAppointments, countUnfinishedAppointments } from "./panel-time";
import { loadDayReverseAssignments } from "./resolve-appointment-operator";
import {
  buildShiftSummary,
  calcSpotMinutes,
  calcUnconfirmedSpotMinutes,
  type ShiftSummary,
  type SpotMinutesMode,
} from "./shift-summary";
import {
  parseRatesSnapshot,
  resolveRatesForDate,
  serializeRatesSnapshot,
  type RatesMap,
} from "./resolve-rates";

export const SHIFT_INCLUDE = {
  reverseAssignments: { include: { staff: { select: { id: true, name: true } } } },
  spotEntries: { orderBy: { startedAt: "asc" as const } },
  adjustments: { orderBy: { createdAt: "desc" as const } },
  member: {
    include: {
      user: { select: { name: true, lastName: true, login: true, email: true } },
      branch: { select: { name: true } },
    },
  },
} as const;

export type ShiftWithRelations = Awaited<
  ReturnType<typeof loadShiftById>
>;

export async function loadShiftById(id: string) {
  return prisma.workShift.findUnique({
    where: { id },
    include: SHIFT_INCLUDE,
  });
}

export async function getMemberIdForUser(userId: string, organizationId: string) {
  const m = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { id: true, role: true, branchId: true },
  });
  return m;
}

export async function resolveShiftRates(
  shift: Pick<WorkShift, "memberId" | "date" | "status" | "ratesSnapshot">,
): Promise<RatesMap> {
  if (shift.status !== "open" && shift.ratesSnapshot) {
    return parseRatesSnapshot(shift.ratesSnapshot);
  }
  const rates = await prisma.memberPayRate.findMany({
    where: { memberId: shift.memberId },
  });
  return resolveRatesForDate(rates, shift.date);
}

/** Effective end of shift for payroll: not after spot work window; may be earlier if closed early. */
export function resolveEffectiveShiftEnd(
  shift: Pick<WorkShift, "date" | "status" | "actualStart" | "actualEnd" | "plannedEnd">,
  now = new Date(),
): Date | null {
  if (!shift.actualStart) return null;

  let end = shift.status === "open" ? now : (shift.actualEnd ?? now);
  if (shift.plannedEnd) {
    const plannedEndDt = parseTimeOnDate(shift.date, shift.plannedEnd);
    if (end.getTime() > plannedEndDt.getTime()) {
      end = plannedEndDt;
    }
  }
  if (end.getTime() < shift.actualStart.getTime()) {
    return shift.actualStart;
  }
  return end;
}

export async function computeShiftSummary(
  shift: NonNullable<ShiftWithRelations>,
  now = new Date(),
  options?: { spotMode?: SpotMinutesMode },
): Promise<ShiftSummary> {
  const spotMode: SpotMinutesMode =
    options?.spotMode ??
    (shift.status === "approved" ? "payroll" : "preview");
  const role = parseAdminRole(shift.member.role);
  const isOperator =
    role === BRANCH_OPERATOR_ROLE ||
    role === SUPER_ADMIN_ROLE ||
    role === BRANCH_ADMIN_ROLE ||
    role === BRANCH_MANAGER_ROLE;

  const shiftStart = shift.actualStart;
  const shiftEnd = resolveEffectiveShiftEnd(shift, now);
  const shiftMinutes =
    shiftStart && shiftEnd
      ? Math.round(Math.max(0, (shiftEnd.getTime() - shiftStart.getTime()) / 60_000))
      : 0;

  const rates = await resolveShiftRates(shift);

  if (!isOperator) {
    return buildShiftSummary({
      isOperator: false,
      shiftMinutes,
      panelMinutes: 0,
      spotMinutes: 0,
      idleMinutes: 0,
      rates,
      spotEntries: [],
    });
  }

  let panelMinutes = 0;
  let inServicePanelMinutes = 0;
  let inServiceCount = 0;
  let unfinishedAppointmentCount = 0;
  if (shiftStart && shiftEnd && shift.reverseAssignments.length) {
    const staffIds = [...new Set(shift.reverseAssignments.map((a) => a.staffId))];
    const dayStart = parseTimeOnDate(shift.date, "00:00");
    const dayEnd = parseTimeOnDate(shift.date, "23:59");
    const [appointments, allDayAssignments] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          branchId: shift.branchId,
          staffId: { in: staffIds },
          startAt: { gte: dayStart, lte: dayEnd },
        },
        select: {
          staffId: true,
          startAt: true,
          endAt: true,
          status: true,
          operatorMemberId: true,
        },
      }),
      loadDayReverseAssignments(shift.branchId, shift.date),
    ]);
    panelMinutes = calcPanelMinutes(
      shift.memberId,
      shift.reverseAssignments,
      appointments,
      allDayAssignments,
      shiftStart,
      shiftEnd,
    );
    inServicePanelMinutes = calcInServicePanelMinutes(
      shift.memberId,
      shift.reverseAssignments,
      appointments,
      allDayAssignments,
      shiftStart,
      shiftEnd,
    );
    inServiceCount = countInServiceAppointments(appointments);
    unfinishedAppointmentCount = countUnfinishedAppointments(appointments);
  }

  if (shift.panelMinutesOverride != null) {
    panelMinutes = shift.panelMinutesOverride;
  }

  const spotMinutes = calcSpotMinutes(shift.spotEntries, shiftEnd ?? now, spotMode);
  const unconfirmedSpotMinutes = calcUnconfirmedSpotMinutes(shift.spotEntries, shiftEnd ?? now);
  let idleMinutes = Math.max(0, shiftMinutes - panelMinutes - spotMinutes);
  if (shift.idleMinutesOverride != null) {
    idleMinutes = shift.idleMinutesOverride;
  }

  const summary = buildShiftSummary({
    isOperator: true,
    shiftMinutes,
    panelMinutes,
    spotMinutes,
    idleMinutes,
    rates,
    spotEntries: shift.spotEntries,
  });

  return {
    ...summary,
    inServicePanelMinutes,
    inServiceCount,
    unfinishedAppointmentCount,
    unconfirmedSpotMinutes,
  };
}

export async function snapshotRatesOnClose(memberId: string, date: string) {
  const rates = await prisma.memberPayRate.findMany({ where: { memberId } });
  return serializeRatesSnapshot(resolveRatesForDate(rates, date));
}

export async function enrichShiftResponse(shift: NonNullable<ShiftWithRelations>, now = new Date()) {
  const summary = await computeShiftSummary(shift, now);
  const planned = await getBranchPlannedWindow(shift.branchId, shift.date);
  const spotTasks = await prisma.spotTask.findMany({
    where: {
      assigneeMemberId: shift.memberId,
      date: shift.date,
      branchWide: false,
    },
    orderBy: { createdAt: "asc" },
  });
  const baselineTasksRaw = await listBaselineTasksForDay(
    shift.branchId,
    shift.date,
  );
  const completions = await prisma.shiftBaselineCompletion.findMany({
    where: { workShiftId: shift.id },
    select: { taskId: true },
  });
  const completedIds = new Set(completions.map((c) => c.taskId));

  const checklistItems = await getChecklistForShift(shift.id, shift.branchId);

  return {
    shift: {
      id: shift.id,
      date: shift.date,
      branchId: shift.branchId,
      memberId: shift.memberId,
      status: shift.status,
      plannedStart: shift.plannedStart ?? planned.start,
      plannedEnd: shift.plannedEnd ?? planned.end,
      actualStart: shift.actualStart?.toISOString() ?? null,
      actualEnd: shift.actualEnd?.toISOString() ?? null,
      employeeSubmittedAt: shift.employeeSubmittedAt?.toISOString() ?? null,
      employeeSubmitComment: shift.employeeSubmitComment ?? null,
      memberName: staffDisplayName(shift.member.user),
      branchName: shift.member.branch?.name ?? null,
      role: shift.member.role,
      workAsAdmin: shift.workAsAdmin,
      plannedStaffId: shift.plannedStaffId,
    },
    reverseAssignments: shift.reverseAssignments.map((a) => ({
      id: a.id,
      staffId: a.staffId,
      staffName: a.staff.name,
      startedAt: a.startedAt.toISOString(),
      endedAt: a.endedAt?.toISOString() ?? null,
    })),
    spotEntries: shift.spotEntries.map((e) => ({
      id: e.id,
      taskId: e.taskId,
      category: e.category,
      comment: e.comment,
      startedAt: e.startedAt.toISOString(),
      endedAt: e.endedAt?.toISOString() ?? null,
      source: e.source,
      isActive: e.isActive,
      confirmedAt: e.confirmedAt?.toISOString() ?? null,
    })),
    spotTasks: spotTasks.map((t) => ({
      id: t.id,
      description: t.description,
      status: t.status,
      plannedMinutes: t.plannedMinutes,
      plannedTimeFrom: t.plannedTimeFrom,
      plannedTimeTo: t.plannedTimeTo,
      spotEntryId: t.spotEntryId,
    })),
    baselineTasks: baselineTasksRaw.map((t) => ({
      id: t.id,
      description: t.description,
      completed: completedIds.has(t.id),
    })),
    checklistItems,
    adjustments: shift.adjustments.map((a) => ({
      id: a.id,
      field: a.field,
      comment: a.comment,
      createdAt: a.createdAt.toISOString(),
    })),
    summary,
  };
}
