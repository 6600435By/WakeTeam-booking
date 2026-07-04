import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import {
  BRANCH_MANAGER_ROLE,
  BRANCH_OPERATOR_ROLE,
  parseAdminRole,
} from "@/lib/admin-roles";
import { getBranchPlannedWindow } from "./branch-planned-window";
import { weekdayMinsk } from "@/lib/time";
import { timeToMinutes } from "@/lib/calendar-grid";
import { resolvePlannedReverseIds } from "./shift-planned-reverses";

export type ReadinessResource = {
  id: string;
  name: string;
  kind: string;
  scheduleToday: { isWorking: boolean; timeFrom: string; timeTo: string } | null;
  weekday: number;
};

export type ReadinessStaffShift = {
  shiftId: string;
  memberId: string;
  memberName: string;
  role: string;
  status: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedStaffId: string | null;
  plannedStaffName: string | null;
  plannedStaffIds: string[];
  plannedStaffNames: string[];
  workAsAdmin: boolean;
};

export type ReadinessWarning = {
  code: string;
  message: string;
  shiftId?: string;
  staffId?: string;
};

export type ShiftReadinessPayload = {
  date: string;
  branchId: string;
  branchPlannedWindow: { start: string | null; end: string | null };
  weekday: number;
  resources: ReadinessResource[];
  staffOnShift: ReadinessStaffShift[];
  warnings: ReadinessWarning[];
};

function intervalsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const a0 = timeToMinutes(aStart);
  const a1 = timeToMinutes(aEnd);
  const b0 = timeToMinutes(bStart);
  const b1 = timeToMinutes(bEnd);
  return a0 < b1 && b0 < a1;
}

export function buildShiftReadinessWarnings(
  resources: ReadinessResource[],
  staffOnShift: ReadinessStaffShift[],
): ReadinessWarning[] {
  const warnings: ReadinessWarning[] = [];
  const workingResources = resources.filter((r) => r.scheduleToday?.isWorking);

  for (const shift of staffOnShift) {
    const role = parseAdminRole(shift.role);
    const needsReverse = role === BRANCH_OPERATOR_ROLE;
    if (needsReverse && shift.plannedStaffIds.length === 0) {
      warnings.push({
        code: "operator_no_reverse",
        message: `${shift.memberName}: не назначен реверс`,
        shiftId: shift.shiftId,
      });
    }
    for (const staffId of shift.plannedStaffIds) {
      const res = resources.find((r) => r.id === staffId);
      if (res && !res.scheduleToday?.isWorking) {
        warnings.push({
          code: "reverse_not_working",
          message: `${shift.memberName}: реверс «${res.name}» сегодня не работает`,
          shiftId: shift.shiftId,
          staffId: res.id,
        });
      }
    }
  }

  for (const res of workingResources) {
    const assigned = staffOnShift.some((s) => s.plannedStaffIds.includes(res.id));
    if (!assigned) {
      warnings.push({
        code: "reverse_unassigned",
        message: `«${res.name}» работает сегодня, но оператор не назначен`,
        staffId: res.id,
      });
    }
  }

  for (let i = 0; i < staffOnShift.length; i++) {
    for (let j = i + 1; j < staffOnShift.length; j++) {
      const a = staffOnShift[i];
      const b = staffOnShift[j];
      const shared = a.plannedStaffIds.filter((id) => b.plannedStaffIds.includes(id));
      if (shared.length === 0) continue;
      const aStart = a.plannedStart ?? "00:00";
      const aEnd = a.plannedEnd ?? "23:59";
      const bStart = b.plannedStart ?? "00:00";
      const bEnd = b.plannedEnd ?? "23:59";
      if (!intervalsOverlap(aStart, aEnd, bStart, bEnd)) continue;
      const resName =
        resources.find((r) => r.id === shared[0])?.name ?? "реверс";
      warnings.push({
        code: "duplicate_reverse",
        message: `«${resName}» назначен и ${a.memberName}, и ${b.memberName} в одно время`,
        shiftId: a.shiftId,
        staffId: shared[0],
      });
    }
  }

  return warnings;
}

export async function queryShiftReadiness(
  organizationId: string,
  branchId: string,
  date: string,
): Promise<ShiftReadinessPayload> {
  const weekday = weekdayMinsk(date);
  const [reverses, shifts, branchPlannedWindow] = await Promise.all([
    prisma.staff.findMany({
      where: { branchId, kind: "revers", isActive: true },
      orderBy: { sortOrder: "asc" },
      include: { schedules: true },
    }),
    prisma.workShift.findMany({
      where: {
        organizationId,
        branchId,
        date,
        status: { in: ["scheduled", "open"] },
      },
      include: {
        member: {
          include: {
            user: { select: { name: true, lastName: true, login: true, email: true } },
          },
        },
        plannedStaff: { select: { id: true, name: true } },
        plannedReverses: {
          include: { staff: { select: { id: true, name: true } } },
          orderBy: { staff: { sortOrder: "asc" } },
        },
      },
      orderBy: [{ plannedStart: "asc" }, { member: { user: { name: "asc" } } }],
    }),
    getBranchPlannedWindow(branchId, date),
  ]);

  const resources: ReadinessResource[] = reverses.map((staff) => {
    const rule = staff.schedules.find((s) => s.weekday === weekday && s.isWorking);
    return {
      id: staff.id,
      name: staff.name,
      kind: staff.kind,
      weekday,
      scheduleToday: rule
        ? { isWorking: true, timeFrom: rule.timeFrom, timeTo: rule.timeTo }
        : null,
    };
  });

  const staffOnShift: ReadinessStaffShift[] = await Promise.all(
    shifts.map(async (shift) => {
      const fromJunction = shift.plannedReverses.map((r) => ({
        id: r.staff.id,
        name: r.staff.name,
      }));
      const plannedStaffIds =
        fromJunction.length > 0
          ? fromJunction.map((r) => r.id)
          : await resolvePlannedReverseIds(shift.id, shift.plannedStaffId);
      const nameById = new Map(fromJunction.map((r) => [r.id, r.name]));
      for (const id of plannedStaffIds) {
        if (!nameById.has(id)) {
          const res = reverses.find((r) => r.id === id);
          if (res) nameById.set(id, res.name);
        }
      }
      return {
        shiftId: shift.id,
        memberId: shift.memberId,
        memberName: staffDisplayName(shift.member.user),
        role: shift.member.role,
        status: shift.status,
        plannedStart: shift.plannedStart,
        plannedEnd: shift.plannedEnd,
        plannedStaffId: shift.plannedStaffId,
        plannedStaffName: shift.plannedStaff?.name ?? null,
        plannedStaffIds,
        plannedStaffNames: plannedStaffIds.map((id) => nameById.get(id) ?? id),
        workAsAdmin: shift.workAsAdmin,
      };
    }),
  );

  const warnings = buildShiftReadinessWarnings(resources, staffOnShift);

  return {
    date,
    branchId,
    weekday,
    branchPlannedWindow,
    resources,
    staffOnShift,
    warnings,
  };
}
