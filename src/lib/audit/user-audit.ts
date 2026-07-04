import type { AdminContext } from "@/lib/admin-access";
import { parseAdminRole, roleLabel } from "@/lib/admin-access";
import { fireAdminActivityFromContext, truncateSummary } from "@/lib/audit/admin-activity-log";
import { staffDisplayName } from "@/lib/staff-user";

export function logUserCreate(
  ctx: AdminContext,
  params: {
    userId: string;
    login: string;
    name: string;
    lastName: string;
    role: string;
    branchName?: string | null;
  },
): void {
  const role = roleLabel(parseAdminRole(params.role) ?? "branch_operator");
  const branch = params.branchName ? `, филиал ${params.branchName}` : "";
  fireAdminActivityFromContext(ctx, {
    action: "user.change",
    entityType: "user",
    entityId: params.userId,
    summary: truncateSummary(
      `Сотрудник: создан ${params.lastName} ${params.name} (${params.login}), роль ${role}${branch}`,
    ),
  });
}

export function logUserUpdate(
  ctx: AdminContext,
  params: {
    userId: string;
    login: string;
    beforeRole: string;
    afterRole: string;
    beforeBranchName?: string | null;
    afterBranchName?: string | null;
  },
): void {
  const parts: string[] = [];
  if (params.beforeRole !== params.afterRole) {
    parts.push(
      `роль ${roleLabel(parseAdminRole(params.beforeRole) ?? "branch_operator")} → ${roleLabel(parseAdminRole(params.afterRole) ?? "branch_operator")}`,
    );
  }
  if (params.beforeBranchName !== params.afterBranchName) {
    parts.push(
      `филиал ${params.beforeBranchName ?? "—"} → ${params.afterBranchName ?? "—"}`,
    );
  }
  if (parts.length === 0) return;
  fireAdminActivityFromContext(ctx, {
    action: "user.change",
    entityType: "user",
    entityId: params.userId,
    summary: truncateSummary(`Сотрудник ${params.login}: ${parts.join(", ")}`),
  });
}

export function logUserDelete(
  ctx: AdminContext,
  params: { userId: string; login: string; displayName: string },
): void {
  fireAdminActivityFromContext(ctx, {
    action: "user.change",
    entityType: "user",
    entityId: params.userId,
    summary: truncateSummary(`Сотрудник: удалён ${params.displayName} (${params.login})`),
  });
}

export function logPayrollConfirm(
  ctx: AdminContext,
  params: {
    memberId: string;
    memberUser: { name: string | null; lastName: string | null; login: string };
    periodFrom: string;
    periodTo: string;
    confirmedAmount: number;
    branchId?: string | null;
  },
): void {
  const name = staffDisplayName(params.memberUser);
  const period = `${formatPeriodDay(params.periodFrom)}–${formatPeriodDay(params.periodTo)}`;
  fireAdminActivityFromContext(ctx, {
    action: "payroll.confirm",
    branchId: params.branchId ?? undefined,
    entityType: "user",
    entityId: params.memberId,
    summary: truncateSummary(`Зарплата: ${name}, период ${period}, ${params.confirmedAmount} BYN`),
  });
}

function formatPeriodDay(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[3]}.${m[2]}`;
}
