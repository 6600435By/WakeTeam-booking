import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import {
  BRANCH_ADMIN_ROLE,
  BRANCH_MANAGER_ROLE,
  BRANCH_OPERATOR_ROLE,
} from "@/lib/admin-access";
import { resolveMonthlyRateForPeriod } from "./resolve-rates";

export async function loadMonthlyPayrollLines(input: {
  organizationId: string;
  from: string;
  to: string;
  branchId?: string | null;
  isBranchAdmin?: boolean;
  adminBranchId?: string | null;
}) {
  const { organizationId, from, to, branchId, isBranchAdmin, adminBranchId } = input;

  const employees = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      role: {
        in: [BRANCH_OPERATOR_ROLE, BRANCH_ADMIN_ROLE, BRANCH_MANAGER_ROLE],
      },
      ...(branchId ? { branchId } : isBranchAdmin && adminBranchId ? { branchId: adminBranchId } : {}),
    },
    include: {
      user: { select: { name: true, lastName: true, login: true, email: true } },
      payRates: true,
    },
    orderBy: { user: { name: "asc" } },
  });

  const monthlyAccruals = await prisma.payrollMonthlyAccrual.findMany({
    where: {
      organizationId,
      periodFrom: from,
      periodTo: to,
      memberId: { in: employees.map((e) => e.id) },
    },
  });
  const accrualByMember = new Map(monthlyAccruals.map((a) => [a.memberId, a]));

  const monthlyLines = employees
    .map((m) => {
      const suggested = resolveMonthlyRateForPeriod(m.payRates, from, to);
      if (suggested == null) return null;
      const accrual = accrualByMember.get(m.id);
      return {
        memberId: m.id,
        memberName: staffDisplayName(m.user),
        role: m.role,
        suggestedAmount: suggested,
        confirmedAmount: accrual?.confirmedAmount ?? null,
        comment: accrual?.comment ?? null,
        confirmedAt: accrual?.confirmedAt?.toISOString() ?? null,
      };
    })
    .filter(Boolean);

  return monthlyLines as NonNullable<(typeof monthlyLines)[number]>[];
}
