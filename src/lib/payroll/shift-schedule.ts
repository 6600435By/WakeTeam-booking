import { prisma } from "@/lib/db";
import {
  BRANCH_ADMIN_ROLE,
  BRANCH_MANAGER_ROLE,
  BRANCH_OPERATOR_ROLE,
  parseAdminRole,
} from "@/lib/admin-roles";

function resolvePlannedStaffIds(
  plannedStaffId?: string | null,
  plannedStaffIds?: string[],
): string[] {
  if (plannedStaffIds?.length) {
    return [...new Set(plannedStaffIds.filter(Boolean))];
  }
  return plannedStaffId ? [plannedStaffId] : [];
}

async function validateReverseIds(
  branchId: string,
  staffIds: string[],
): Promise<{ error: string } | { staffIds: string[] }> {
  if (staffIds.length === 0) return { staffIds: [] };
  const found = await prisma.staff.findMany({
    where: { id: { in: staffIds }, branchId, kind: "revers", isActive: true },
    select: { id: true },
  });
  if (found.length !== staffIds.length) {
    return { error: "Один или несколько реверсов не найдены" };
  }
  return { staffIds };
}

export async function validateShiftSchedule(
  branchId: string,
  memberId: string,
  plannedStaffId?: string | null,
  workAsAdmin?: boolean,
  plannedStaffIds?: string[],
) {
  const staffIds = resolvePlannedStaffIds(plannedStaffId, plannedStaffIds);
  const member = await prisma.organizationMember.findUnique({
    where: { id: memberId },
    select: {
      role: true,
      branchId: true,
      branchScopes: { select: { branchId: true } },
    },
  });
  if (!member) {
    return { error: "Сотрудник не найден" as const };
  }

  const role = parseAdminRole(member.role);
  if (role === BRANCH_MANAGER_ROLE) {
    const scoped = member.branchScopes.some((s) => s.branchId === branchId);
    if (!scoped) {
      return { error: "Филиал не закреплён за управляющим" as const };
    }
    if (staffIds.length === 0) {
      return { role, plannedStaffId: null, plannedStaffIds: [], workAsAdmin: false };
    }
    const validated = await validateReverseIds(branchId, staffIds);
    if ("error" in validated) return validated;
    return {
      role,
      plannedStaffId: validated.staffIds[0] ?? null,
      plannedStaffIds: validated.staffIds,
      workAsAdmin: false,
    };
  }

  if (member.branchId !== branchId) {
    return { error: "Сотрудник другого филиала" as const };
  }
  if (role !== BRANCH_OPERATOR_ROLE && role !== BRANCH_ADMIN_ROLE) {
    return { error: "На смену можно назначить оператора, админа или управляющего" as const };
  }
  if (role === BRANCH_ADMIN_ROLE) {
    return { role, plannedStaffId: null, plannedStaffIds: [], workAsAdmin: false };
  }
  if (staffIds.length === 0) {
    return { error: "Выберите реверс для оператора" as const };
  }
  const validated = await validateReverseIds(branchId, staffIds);
  if ("error" in validated) return validated;
  return {
    role,
    plannedStaffId: validated.staffIds[0] ?? null,
    plannedStaffIds: validated.staffIds,
    workAsAdmin: Boolean(workAsAdmin),
  };
}
