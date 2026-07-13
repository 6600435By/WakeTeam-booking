import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";

export type BranchOpenShift = {
  shiftId: string;
  memberId: string;
  memberName: string;
  actualStart: string | null;
  workAsAdmin: boolean;
};

export type BranchShiftStatus = {
  branchId: string;
  date: string;
  isOpen: boolean;
  openCount: number;
  openShifts: BranchOpenShift[];
  scheduledCount: number;
};

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

export function formatBranchOpenLabel(status: BranchShiftStatus): string {
  if (!status.isOpen) return "";
  const names = status.openShifts.map((s) => s.memberName);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} и ${names[1]}`;
  return `${names[0]} и ещё ${names.length - 1}`;
}
