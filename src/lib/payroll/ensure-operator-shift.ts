import { prisma } from "@/lib/db";
import { formatDateKey } from "@/lib/time";
import { getBranchPlannedWindow } from "./branch-planned-window";

/**
 * If an appointment pins an operator who has no WorkShift that day,
 * auto-create an open panel-only shift (пульт without простой).
 */
export async function ensureOperatorOnShift(params: {
  organizationId: string;
  branchId: string;
  memberId: string;
  at: Date;
}): Promise<{ created: boolean; shiftId: string } | null> {
  const { organizationId, branchId, memberId, at } = params;
  if (!memberId) return null;

  const date = formatDateKey(at);
  const existing = await prisma.workShift.findUnique({
    where: { memberId_date: { memberId, date } },
    select: { id: true },
  });
  if (existing) {
    return { created: false, shiftId: existing.id };
  }

  const member = await prisma.organizationMember.findUnique({
    where: { id: memberId },
    select: { organizationId: true, branchId: true },
  });
  if (!member || member.organizationId !== organizationId) {
    return null;
  }

  const planned = await getBranchPlannedWindow(branchId, date);
  const shift = await prisma.workShift.create({
    data: {
      organizationId,
      branchId,
      memberId,
      date,
      plannedStart: planned.start,
      plannedEnd: planned.end,
      actualStart: at,
      status: "open",
      panelOnly: true,
    },
    select: { id: true },
  });

  return { created: true, shiftId: shift.id };
}
