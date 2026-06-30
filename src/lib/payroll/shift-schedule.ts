import { prisma } from "@/lib/db";
import {
  BRANCH_ADMIN_ROLE,
  BRANCH_OPERATOR_ROLE,
  parseAdminRole,
} from "@/lib/admin-access";

export async function validateShiftSchedule(
  branchId: string,
  memberId: string,
  plannedStaffId?: string,
  workAsAdmin?: boolean,
) {
  const member = await prisma.organizationMember.findUnique({
    where: { id: memberId },
    select: { role: true, branchId: true },
  });
  if (!member || member.branchId !== branchId) {
    return { error: "Сотрудник другого филиала" as const };
  }
  const role = parseAdminRole(member.role);
  if (role !== BRANCH_OPERATOR_ROLE && role !== BRANCH_ADMIN_ROLE) {
    return { error: "На смену можно назначить оператора или админа филиала" as const };
  }
  if (role === BRANCH_ADMIN_ROLE) {
    return { role, plannedStaffId: null, workAsAdmin: false };
  }
  if (workAsAdmin) {
    return { role, plannedStaffId: null, workAsAdmin: true };
  }
  if (!plannedStaffId) {
    return { error: "Выберите реверс для оператора" as const };
  }
  const staff = await prisma.staff.findFirst({
    where: { id: plannedStaffId, branchId, kind: "revers", isActive: true },
  });
  if (!staff) {
    return { error: "Реверс не найден" as const };
  }
  return { role, plannedStaffId, workAsAdmin: false };
}
