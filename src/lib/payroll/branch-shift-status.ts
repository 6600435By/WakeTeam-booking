import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import type { BranchShiftStatus } from "./branch-shift-status.shared";

export type { BranchOpenShift, BranchShiftStatus } from "./branch-shift-status.shared";
export { formatBranchOpenLabel } from "./branch-shift-status.shared";

export async function queryBranchShiftStatus(
  organizationId: string,
  branchId: string,
  date: string,
): Promise<BranchShiftStatus> {
  const shifts = await prisma.workShift.findMany({
    where: {
      organizationId,
      branchId,
      date,
      status: { in: ["scheduled", "open"] },
    },
    include: {
      member: {
        include: {
          user: { select: { name: true, lastName: true, login: true } },
        },
      },
    },
    orderBy: [{ actualStart: "asc" }, { plannedStart: "asc" }],
  });

  const openShifts = shifts
    .filter((s) => s.status === "open")
    .map((s) => ({
      shiftId: s.id,
      memberId: s.memberId,
      memberName: staffDisplayName(s.member.user),
      actualStart: s.actualStart?.toISOString() ?? null,
      workAsAdmin: s.workAsAdmin,
    }));

  return {
    branchId,
    date,
    isOpen: openShifts.length > 0,
    openCount: openShifts.length,
    openShifts,
    scheduledCount: shifts.filter((s) => s.status === "scheduled").length,
  };
}
