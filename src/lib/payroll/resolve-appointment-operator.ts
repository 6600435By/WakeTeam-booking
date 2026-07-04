import type { ReverseAssignment } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDateKey } from "@/lib/time";

export type ReverseAssignmentWithShiftMember = ReverseAssignment & {
  shift: { memberId: string };
};

export function inferOperatorMemberIdAtTime(
  staffId: string,
  at: Date,
  assignments: ReverseAssignmentWithShiftMember[],
): string | null {
  for (const assignment of assignments) {
    if (assignment.staffId !== staffId) continue;
    const end = assignment.endedAt ?? new Date("9999-12-31T23:59:59.999Z");
    if (at >= assignment.startedAt && at < end) {
      return assignment.shift.memberId;
    }
  }
  return null;
}

export function effectiveOperatorMemberId(
  appt: {
    staffId: string;
    startAt: Date;
    operatorMemberId?: string | null;
  },
  assignments: ReverseAssignmentWithShiftMember[],
): string | null {
  if (appt.operatorMemberId) return appt.operatorMemberId;
  return inferOperatorMemberIdAtTime(appt.staffId, appt.startAt, assignments);
}

export async function loadDayReverseAssignments(
  branchId: string,
  dateKey: string,
): Promise<ReverseAssignmentWithShiftMember[]> {
  return prisma.reverseAssignment.findMany({
    where: { shift: { branchId, date: dateKey } },
    include: { shift: { select: { memberId: true } } },
    orderBy: { startedAt: "asc" },
  });
}

export async function resolveDefaultOperatorMemberId(
  branchId: string,
  staffId: string,
  startAt: Date,
): Promise<string | null> {
  const dateKey = formatDateKey(startAt);
  const assignments = await loadDayReverseAssignments(branchId, dateKey);
  return inferOperatorMemberIdAtTime(staffId, startAt, assignments);
}
