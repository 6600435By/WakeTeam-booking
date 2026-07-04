import type { User } from "@prisma/client";
import { getSessionUser } from "./auth";
import { prisma } from "./db";
import { memberHasWorkAsAdminElevation } from "./payroll/work-as-admin-access";
import { memberHasManagerOnDutyElevation } from "./payroll/manager-on-duty-access";
import { formatDateKey } from "./time";
import {
  BRANCH_ADMIN_ROLE,
  BRANCH_MANAGER_ROLE,
  BRANCH_OPERATOR_ROLE,
  SUPER_ADMIN_ROLE,
  parseAdminRole,
  type AdminRole,
} from "./admin-roles";

export {
  SUPER_ADMIN_ROLE,
  BRANCH_MANAGER_ROLE,
  BRANCH_ADMIN_ROLE,
  BRANCH_OPERATOR_ROLE,
  parseAdminRole,
  type AdminRole,
} from "./admin-roles";

export type AdminContext = {
  user: User;
  memberId: string;
  organizationId: string;
  role: AdminRole;
  branchId: string | null;
  branchName: string | null;
  isSuperAdmin: boolean;
  isBranchManager: boolean;
  isBranchAdmin: boolean;
  isBranchOperator: boolean;
  managedBranchIds: string[];
  /** Оператор на смене workAsAdmin: тарифы оператора, правка журнала, назначение операторов на сегодня. */
  workAsAdminElevated: boolean;
  /** Управляющий на открытой смене сегодня в закреплённом филиале. */
  managerOnDutyElevated: boolean;
  /** Филиал открытой смены управляющего (если есть). */
  managerOnDutyBranchId: string | null;
};

export class AdminAccessError extends Error {
  constructor(
    message: string,
    public status: number = 403,
  ) {
    super(message);
  }
}

async function loadManagedBranchIds(memberId: string): Promise<string[]> {
  const scopes = await prisma.memberBranchScope.findMany({
    where: { memberId },
    select: { branchId: true },
    orderBy: { branchId: "asc" },
  });
  return scopes.map((s) => s.branchId);
}

export async function getAdminContext(): Promise<AdminContext | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
    include: { branch: { select: { id: true, name: true } } },
  });
  if (!membership) return null;

  const role = parseAdminRole(membership.role);
  if (!role) return null;

  const isSuperAdmin = role === SUPER_ADMIN_ROLE;
  const isBranchManager = role === BRANCH_MANAGER_ROLE;

  let managedBranchIds: string[] = [];
  if (isBranchManager) {
    managedBranchIds = await loadManagedBranchIds(membership.id);
    if (managedBranchIds.length === 0) return null;
  } else if (!isSuperAdmin && !membership.branchId) {
    return null;
  }

  const workAsAdminElevated =
    role === BRANCH_OPERATOR_ROLE &&
    (await memberHasWorkAsAdminElevation(membership.id));

  const managerDuty = isBranchManager
    ? await memberHasManagerOnDutyElevation(membership.id)
    : null;

  return {
    user,
    memberId: membership.id,
    organizationId: membership.organizationId,
    role,
    branchId: membership.branchId,
    branchName: membership.branch?.name ?? null,
    isSuperAdmin,
    isBranchManager,
    isBranchAdmin: role === BRANCH_ADMIN_ROLE,
    isBranchOperator: role === BRANCH_OPERATOR_ROLE,
    managedBranchIds,
    workAsAdminElevated,
    managerOnDutyElevated: Boolean(managerDuty),
    managerOnDutyBranchId: managerDuty?.branchId ?? null,
  };
}

export async function requireAdminContext(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) throw new AdminAccessError("UNAUTHORIZED", 401);
  return ctx;
}

export function isInManagementScope(ctx: AdminContext, branchId: string): boolean {
  if (ctx.isSuperAdmin) return true;
  if (ctx.isBranchManager) return ctx.managedBranchIds.includes(branchId);
  if (ctx.isBranchAdmin) return ctx.branchId === branchId;
  return false;
}

export function canManageJournal(_ctx: AdminContext) {
  return true;
}

export function canCreateJournalInBranch(ctx: AdminContext, branchId: string): boolean {
  if (ctx.isSuperAdmin || ctx.isBranchAdmin) return true;
  if (ctx.isBranchManager) return true;
  if (ctx.workAsAdminElevated && ctx.branchId === branchId) return true;
  if (ctx.managerOnDutyElevated && ctx.managerOnDutyBranchId === branchId) return true;
  return false;
}

export function canEditJournalInBranch(ctx: AdminContext, branchId: string): boolean {
  if (ctx.isSuperAdmin || ctx.isBranchAdmin) return isInManagementScope(ctx, branchId);
  if (ctx.isBranchManager) {
    if (isInManagementScope(ctx, branchId)) return true;
    if (ctx.managerOnDutyElevated && ctx.managerOnDutyBranchId === branchId) return true;
    return false;
  }
  if (ctx.workAsAdminElevated && ctx.branchId === branchId) return true;
  return false;
}

export function canEditJournalAppointments(ctx: AdminContext, branchId?: string) {
  if (branchId) return canEditJournalInBranch(ctx, branchId);
  return (
    ctx.isSuperAdmin ||
    ctx.isBranchAdmin ||
    ctx.isBranchManager ||
    ctx.workAsAdminElevated ||
    ctx.managerOnDutyElevated
  );
}

export function canManageCatalog(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin || ctx.isBranchManager;
}

export function canManageBranchSettings(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin || ctx.isBranchManager;
}

export function canManageUsers(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchManager;
}

export function canManageWidget(ctx: AdminContext) {
  return ctx.isSuperAdmin;
}

export function canViewAdminActivityLog(ctx: AdminContext) {
  return ctx.isSuperAdmin;
}

export function canViewStatistics(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin || ctx.isBranchManager;
}

export function canViewClients(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin || ctx.isBranchManager;
}

export function canViewMemberships(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin || ctx.isBranchManager;
}

export function canLogOwnShift(ctx: AdminContext) {
  return (
    ctx.isSuperAdmin ||
    ctx.isBranchOperator ||
    ctx.isBranchAdmin ||
    ctx.isBranchManager
  );
}

export function canViewShiftCalendar(ctx: AdminContext) {
  return (
    ctx.isSuperAdmin ||
    ctx.isBranchAdmin ||
    ctx.isBranchManager ||
    ctx.isBranchOperator
  );
}

export function canEditShiftCalendar(ctx: AdminContext, branchId?: string) {
  if (ctx.isSuperAdmin) return true;
  if (ctx.isBranchManager && branchId) {
    return isInManagementScope(ctx, branchId);
  }
  if (ctx.isBranchManager) return true;
  return false;
}

/** Назначить смену: супер-админ / управляющий; оператор workAsAdmin — только сегодня, только операторов. */
export function canAssignShiftOnDuty(ctx: AdminContext, branchId?: string) {
  if (canEditShiftCalendar(ctx, branchId)) return true;
  if (ctx.workAsAdminElevated) return true;
  if (ctx.managerOnDutyElevated) return true;
  return false;
}

/** Просмотр «Проверки перед сменой». */
export function canViewShiftReadiness(ctx: AdminContext, branchId?: string) {
  if (ctx.isSuperAdmin) return true;
  if (ctx.isBranchManager) {
    if (!branchId) return true;
    return (
      isInManagementScope(ctx, branchId) ||
      (ctx.managerOnDutyElevated && ctx.managerOnDutyBranchId === branchId)
    );
  }
  if (ctx.isBranchAdmin) {
    if (!branchId) return true;
    return ctx.branchId === branchId;
  }
  if (ctx.workAsAdminElevated) return true;
  if (ctx.managerOnDutyElevated) return true;
  return false;
}

/** Редактирование назначений в проверке (inline PATCH/POST schedule). */
export function canEditShiftReadiness(ctx: AdminContext, branchId: string) {
  if (ctx.isSuperAdmin) return true;
  if (ctx.isBranchManager && isInManagementScope(ctx, branchId)) return true;
  if (ctx.isBranchAdmin && ctx.branchId === branchId) return true;
  if (ctx.workAsAdminElevated && ctx.branchId === branchId) return true;
  if (ctx.managerOnDutyElevated && ctx.managerOnDutyBranchId === branchId) return true;
  return false;
}

export function assertShiftScheduleWrite(
  ctx: AdminContext,
  opts: { date: string; branchId: string; targetMemberRole?: string | null },
) {
  if (canEditShiftCalendar(ctx, opts.branchId)) return;
  if (ctx.isBranchAdmin && ctx.branchId === opts.branchId) return;
  const onDuty =
    (ctx.workAsAdminElevated && ctx.branchId === opts.branchId) ||
    (ctx.managerOnDutyElevated && ctx.managerOnDutyBranchId === opts.branchId);
  if (!onDuty) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
  if (opts.date !== formatDateKey(new Date())) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
  if (opts.targetMemberRole && opts.targetMemberRole !== BRANCH_OPERATOR_ROLE) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

/** @deprecated use canEditShiftCalendar */
export function canAssignSpotTasks(ctx: AdminContext, branchId?: string) {
  return canEditShiftCalendar(ctx, branchId);
}

export function canSetPayRates(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin || ctx.isBranchManager;
}

export function canViewStaffUsers(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin || ctx.isBranchManager;
}

export function canReviewShifts(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin || ctx.isBranchManager;
}

export function canApproveShift(
  ctx: AdminContext,
  shiftMemberRole: string,
  shiftBranchId: string,
): boolean {
  if (ctx.isSuperAdmin) return true;
  if (ctx.isBranchManager) {
    if (!isInManagementScope(ctx, shiftBranchId)) return false;
    const role = parseAdminRole(shiftMemberRole);
    if (role === SUPER_ADMIN_ROLE || role === BRANCH_MANAGER_ROLE) return false;
    return role === BRANCH_OPERATOR_ROLE || role === BRANCH_ADMIN_ROLE;
  }
  if (!ctx.isBranchAdmin) return false;
  if (ctx.branchId !== shiftBranchId) return false;
  return shiftMemberRole === BRANCH_OPERATOR_ROLE;
}

export function requiresSuperAdminApproval(shiftMemberRole: string): boolean {
  const role = parseAdminRole(shiftMemberRole);
  return (
    role === BRANCH_ADMIN_ROLE ||
    role === BRANCH_MANAGER_ROLE ||
    role === SUPER_ADMIN_ROLE
  );
}

export function canSubmitShiftChangeRequest(ctx: AdminContext) {
  return (
    ctx.isSuperAdmin ||
    ctx.isBranchAdmin ||
    ctx.isBranchManager ||
    ctx.isBranchOperator
  );
}

export function canReviewShiftChangeRequests(ctx: AdminContext) {
  return ctx.isSuperAdmin;
}

export function assertShiftSelfOrAdmin(
  ctx: AdminContext,
  shiftMemberId: string,
  branchId: string,
) {
  if (ctx.isSuperAdmin) return;
  if (ctx.memberId === shiftMemberId) return;
  if (ctx.isBranchAdmin && ctx.branchId === branchId) return;
  if (ctx.isBranchManager && isInManagementScope(ctx, branchId)) return;
  throw new AdminAccessError("FORBIDDEN", 403);
}

export async function assertMemberAccess(ctx: AdminContext, memberId: string) {
  const member = await prisma.organizationMember.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      organizationId: true,
      branchId: true,
      role: true,
      branchScopes: { select: { branchId: true } },
    },
  });
  if (!member || member.organizationId !== ctx.organizationId) {
    throw new AdminAccessError("NOT_FOUND", 404);
  }
  if (ctx.isSuperAdmin) return member;
  if (member.id === ctx.memberId) return member;

  if (ctx.isBranchManager) {
    const role = parseAdminRole(member.role);
    if (role === SUPER_ADMIN_ROLE || role === BRANCH_MANAGER_ROLE) {
      throw new AdminAccessError("FORBIDDEN", 403);
    }
    const memberBranchIds = new Set<string>();
    if (member.branchId) memberBranchIds.add(member.branchId);
    for (const s of member.branchScopes) memberBranchIds.add(s.branchId);
    const inScope = [...memberBranchIds].some((id) =>
      ctx.managedBranchIds.includes(id),
    );
    if (!inScope) throw new AdminAccessError("FORBIDDEN", 403);
    return member;
  }

  if (ctx.branchId !== member.branchId) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
  return member;
}

export function assertSuperAdmin(ctx: AdminContext) {
  if (!ctx.isSuperAdmin) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

export function assertCanManageUsers(ctx: AdminContext) {
  if (!canManageUsers(ctx)) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

export async function assertPayRatesAccess(ctx: AdminContext, userId: string) {
  if (!canSetPayRates(ctx)) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }

  const member = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: ctx.organizationId,
        userId,
      },
    },
    include: { branchScopes: { select: { branchId: true } } },
  });
  if (!member) {
    throw new AdminAccessError("NOT_FOUND", 404);
  }

  const role = parseAdminRole(member.role);
  if (ctx.isBranchAdmin) {
    if (role === SUPER_ADMIN_ROLE || role === BRANCH_MANAGER_ROLE) {
      throw new AdminAccessError("FORBIDDEN", 403);
    }
    if (member.branchId !== ctx.branchId) {
      throw new AdminAccessError("FORBIDDEN", 403);
    }
  }
  if (ctx.isBranchManager) {
    if (role === SUPER_ADMIN_ROLE || role === BRANCH_MANAGER_ROLE) {
      throw new AdminAccessError("FORBIDDEN", 403);
    }
    const branchIds = new Set<string>();
    if (member.branchId) branchIds.add(member.branchId);
    for (const s of member.branchScopes) branchIds.add(s.branchId);
    const inScope = [...branchIds].some((id) => ctx.managedBranchIds.includes(id));
    if (!inScope) throw new AdminAccessError("FORBIDDEN", 403);
  }

  return member;
}

export function assertCatalogAccess(ctx: AdminContext, branchId?: string) {
  if (!canManageCatalog(ctx)) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
  if (branchId && ctx.isBranchManager && !isInManagementScope(ctx, branchId)) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

export function assertBranchSettingsAccess(ctx: AdminContext, branchId?: string) {
  if (!canManageBranchSettings(ctx)) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
  if (branchId && ctx.isBranchManager && !isInManagementScope(ctx, branchId)) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

export function assertJournalEditAccess(ctx: AdminContext, branchId?: string) {
  if (branchId) {
    if (!canEditJournalInBranch(ctx, branchId)) {
      throw new AdminAccessError("FORBIDDEN", 403);
    }
    return;
  }
  if (!canEditJournalAppointments(ctx)) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

export function assertJournalCreateAccess(ctx: AdminContext, branchId: string) {
  if (!canCreateJournalInBranch(ctx, branchId)) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

export function assertJournalAccess(_ctx: AdminContext) {
  return;
}

export function assertStatisticsAccess(ctx: AdminContext) {
  if (!canViewStatistics(ctx)) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

export function assertBranchAccess(ctx: AdminContext, branchId: string) {
  if (ctx.isSuperAdmin) return;
  if (ctx.isBranchManager && isInManagementScope(ctx, branchId)) return;
  if (ctx.branchId !== branchId) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

export function assertManagementBranchAccess(ctx: AdminContext, branchId: string) {
  if (!isInManagementScope(ctx, branchId)) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

/** Для branch users — их филиал; для manager — из managed; для super — из запроса или null. */
export function resolveManagementBranchFilter(
  ctx: AdminContext,
  requested?: string | null,
): string | undefined {
  if (ctx.isSuperAdmin) return requested ?? undefined;
  if (ctx.isBranchManager) {
    if (requested) {
      if (!ctx.managedBranchIds.includes(requested)) {
        throw new AdminAccessError("FORBIDDEN", 403);
      }
      return requested;
    }
    return ctx.managedBranchIds[0];
  }
  if (requested && requested !== ctx.branchId) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
  return ctx.branchId ?? undefined;
}

/** Журнал: super/manager могут выбрать любой филиал организации. */
export function resolveJournalBranchFilter(
  ctx: AdminContext,
  requested?: string | null,
): string | undefined {
  if (ctx.isSuperAdmin || ctx.isBranchManager) return requested ?? undefined;
  if (requested && requested !== ctx.branchId) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
  return ctx.branchId ?? undefined;
}

/** @deprecated use resolveManagementBranchFilter for management pages */
export function resolveBranchFilter(
  ctx: AdminContext,
  requested?: string | null,
): string | undefined {
  return resolveManagementBranchFilter(ctx, requested);
}

export function branchListWhere(ctx: AdminContext) {
  if (ctx.isSuperAdmin) {
    return { organizationId: ctx.organizationId, isActive: true };
  }
  if (ctx.isBranchManager) {
    return {
      organizationId: ctx.organizationId,
      isActive: true,
      id: { in: ctx.managedBranchIds },
    };
  }
  return {
    organizationId: ctx.organizationId,
    isActive: true,
    id: ctx.branchId!,
  };
}

export async function assertStaffAccess(ctx: AdminContext, staffId: string) {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { id: true, branchId: true, organizationId: true },
  });
  if (!staff || staff.organizationId !== ctx.organizationId) {
    throw new AdminAccessError("NOT_FOUND", 404);
  }
  assertBranchAccess(ctx, staff.branchId);
  return staff;
}

/** Журнал: управляющий может выбирать реверс в любом филиале сети. */
export async function assertStaffJournalAccess(ctx: AdminContext, staffId: string) {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { id: true, branchId: true, organizationId: true },
  });
  if (!staff || staff.organizationId !== ctx.organizationId) {
    throw new AdminAccessError("NOT_FOUND", 404);
  }
  if (ctx.isSuperAdmin || ctx.isBranchAdmin || ctx.isBranchManager) return staff;
  assertBranchAccess(ctx, staff.branchId);
  return staff;
}

export async function assertServiceJournalAccess(ctx: AdminContext, serviceId: string) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, branchId: true, branch: { select: { organizationId: true } } },
  });
  if (!service || service.branch.organizationId !== ctx.organizationId) {
    throw new AdminAccessError("NOT_FOUND", 404);
  }
  if (ctx.isSuperAdmin || ctx.isBranchAdmin || ctx.isBranchManager) return service;
  assertBranchAccess(ctx, service.branchId);
  return service;
}

export async function assertServiceAccess(ctx: AdminContext, serviceId: string) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, branchId: true, branch: { select: { organizationId: true } } },
  });
  if (!service || service.branch.organizationId !== ctx.organizationId) {
    throw new AdminAccessError("NOT_FOUND", 404);
  }
  assertBranchAccess(ctx, service.branchId);
  return service;
}

export async function assertAppointmentAccess(
  ctx: AdminContext,
  appointmentId: string,
  mode: "read" | "write" = "write",
) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, branchId: true, organizationId: true },
  });
  if (!appt || appt.organizationId !== ctx.organizationId) {
    throw new AdminAccessError("NOT_FOUND", 404);
  }
  if (mode === "read") return appt;
  if (!canEditJournalInBranch(ctx, appt.branchId)) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
  return appt;
}

export function roleLabel(role: AdminRole): string {
  switch (role) {
    case SUPER_ADMIN_ROLE:
      return "Супер-админ";
    case BRANCH_MANAGER_ROLE:
      return "Управляющий филиалом";
    case BRANCH_ADMIN_ROLE:
      return "Админ филиала";
    case BRANCH_OPERATOR_ROLE:
      return "Оператор филиала";
  }
}

export function canAssignRole(
  ctx: AdminContext,
  targetRole: AdminRole,
  targetBranchId: string | null,
  targetBranchIds?: string[],
): boolean {
  if (ctx.isSuperAdmin) return true;
  if (!ctx.isBranchManager) return false;
  if (targetRole === SUPER_ADMIN_ROLE || targetRole === BRANCH_MANAGER_ROLE) {
    return false;
  }
  if (targetRole === BRANCH_ADMIN_ROLE || targetRole === BRANCH_OPERATOR_ROLE) {
    if (!targetBranchId) return false;
    return ctx.managedBranchIds.includes(targetBranchId);
  }
  if (targetBranchIds?.length) {
    return targetBranchIds.every((id) => ctx.managedBranchIds.includes(id));
  }
  return false;
}

export function handleAdminError(e: unknown) {
  if (e instanceof AdminAccessError) {
    if (e.message === "UNAUTHORIZED") {
      return { status: 401, error: "Unauthorized" };
    }
    if (e.message === "NOT_FOUND") {
      return { status: 404, error: "Not found" };
    }
    return { status: e.status, error: "Нет доступа" };
  }
  if (e instanceof Error && e.message === "UNAUTHORIZED") {
    return { status: 401, error: "Unauthorized" };
  }
  return null;
}
