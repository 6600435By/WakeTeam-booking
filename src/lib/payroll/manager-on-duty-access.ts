import { prisma } from "@/lib/db";
import { formatDateKey } from "@/lib/time";
import { BRANCH_MANAGER_ROLE, parseAdminRole } from "@/lib/admin-roles";

const ON_DUTY_STATUSES = ["scheduled", "open", "closed"] as const;

/** Управляющий на открытой смене сегодня в закреплённом филиале. */
export async function memberHasManagerOnDutyElevation(
  memberId: string,
  date = formatDateKey(new Date()),
): Promise<{ branchId: string } | null> {
  const member = await prisma.organizationMember.findUnique({
    where: { id: memberId },
    select: { role: true, branchScopes: { select: { branchId: true } } },
  });
  if (!member || parseAdminRole(member.role) !== BRANCH_MANAGER_ROLE) {
    return null;
  }
  const scopedIds = new Set(member.branchScopes.map((s) => s.branchId));

  const shift = await prisma.workShift.findFirst({
    where: {
      memberId,
      date,
      status: { in: [...ON_DUTY_STATUSES] },
    },
    select: { branchId: true },
    orderBy: { actualStart: "desc" },
  });
  if (!shift || !scopedIds.has(shift.branchId)) return null;
  return { branchId: shift.branchId };
}
