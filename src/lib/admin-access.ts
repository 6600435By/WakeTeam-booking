import type { User } from "@prisma/client";
import { getSessionUser } from "./auth";
import { prisma } from "./db";
import {
  BRANCH_ADMIN_ROLE,
  BRANCH_OPERATOR_ROLE,
  SUPER_ADMIN_ROLE,
  parseAdminRole,
  type AdminRole,
} from "./admin-roles";

export {
  SUPER_ADMIN_ROLE,
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
  isBranchAdmin: boolean;
  isBranchOperator: boolean;
};

export class AdminAccessError extends Error {
  constructor(
    message: string,
    public status: number = 403,
  ) {
    super(message);
  }
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
  if (!isSuperAdmin && !membership.branchId) return null;

  return {
    user,
    memberId: membership.id,
    organizationId: membership.organizationId,
    role,
    branchId: membership.branchId,
    branchName: membership.branch?.name ?? null,
    isSuperAdmin,
    isBranchAdmin: role === BRANCH_ADMIN_ROLE,
    isBranchOperator: role === BRANCH_OPERATOR_ROLE,
  };
}

export async function requireAdminContext(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) throw new AdminAccessError("UNAUTHORIZED", 401);
  return ctx;
}

export function canManageJournal(ctx: AdminContext) {
  return true;
}

export function canManageCatalog(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin;
}

export function canManageBranchSettings(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin;
}

export function canManageUsers(ctx: AdminContext) {
  return ctx.isSuperAdmin;
}

export function canManageWidget(ctx: AdminContext) {
  return ctx.isSuperAdmin;
}

export function canViewStatistics(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin;
}

export function canViewClients(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin;
}

export function canViewMemberships(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin;
}

export function canLogOwnShift(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchOperator || ctx.isBranchAdmin;
}

export function canViewShiftCalendar(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin || ctx.isBranchOperator;
}

export function canEditShiftCalendar(ctx: AdminContext) {
  return ctx.isSuperAdmin;
}

/** @deprecated use canEditShiftCalendar */
export function canAssignSpotTasks(ctx: AdminContext) {
  return canEditShiftCalendar(ctx);
}

export function canSetPayRates(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin;
}

export function canViewStaffUsers(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin;
}

export function canReviewShifts(ctx: AdminContext) {
  return ctx.isSuperAdmin;
}

export function canSubmitShiftChangeRequest(ctx: AdminContext) {
  return ctx.isSuperAdmin || ctx.isBranchAdmin || ctx.isBranchOperator;
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
  throw new AdminAccessError("FORBIDDEN", 403);
}

export async function assertMemberAccess(ctx: AdminContext, memberId: string) {
  const member = await prisma.organizationMember.findUnique({
    where: { id: memberId },
    select: { id: true, organizationId: true, branchId: true },
  });
  if (!member || member.organizationId !== ctx.organizationId) {
    throw new AdminAccessError("NOT_FOUND", 404);
  }
  if (!ctx.isSuperAdmin) {
    if (member.id !== ctx.memberId && ctx.branchId !== member.branchId) {
      throw new AdminAccessError("FORBIDDEN", 403);
    }
  }
  return member;
}

export function assertSuperAdmin(ctx: AdminContext) {
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
  });
  if (!member) {
    throw new AdminAccessError("NOT_FOUND", 404);
  }

  const role = parseAdminRole(member.role);
  if (ctx.isBranchAdmin) {
    if (role === SUPER_ADMIN_ROLE || member.branchId !== ctx.branchId) {
      throw new AdminAccessError("FORBIDDEN", 403);
    }
  }

  return member;
}

export function assertCatalogAccess(ctx: AdminContext) {
  if (!canManageCatalog(ctx)) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

export function assertBranchSettingsAccess(ctx: AdminContext) {
  if (!canManageBranchSettings(ctx)) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

export function assertJournalAccess(ctx: AdminContext) {
  if (!canManageJournal(ctx)) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

export function assertStatisticsAccess(ctx: AdminContext) {
  if (!canViewStatistics(ctx)) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

export function assertBranchAccess(ctx: AdminContext, branchId: string) {
  if (ctx.isSuperAdmin) return;
  if (ctx.branchId !== branchId) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

/** Для branch users всегда возвращает их филиал; для super — из запроса или null (все). */
export function resolveBranchFilter(
  ctx: AdminContext,
  requested?: string | null,
): string | undefined {
  if (!ctx.isSuperAdmin) {
    if (requested && requested !== ctx.branchId) {
      throw new AdminAccessError("FORBIDDEN", 403);
    }
    return ctx.branchId ?? undefined;
  }
  return requested ?? undefined;
}

export function branchListWhere(ctx: AdminContext) {
  if (ctx.isSuperAdmin) {
    return { organizationId: ctx.organizationId, isActive: true };
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

export async function assertAppointmentAccess(ctx: AdminContext, appointmentId: string) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, branchId: true, organizationId: true },
  });
  if (!appt || appt.organizationId !== ctx.organizationId) {
    throw new AdminAccessError("NOT_FOUND", 404);
  }
  assertBranchAccess(ctx, appt.branchId);
  return appt;
}

export function roleLabel(role: AdminRole): string {
  switch (role) {
    case SUPER_ADMIN_ROLE:
      return "Супер-админ";
    case BRANCH_ADMIN_ROLE:
      return "Админ филиала";
    case BRANCH_OPERATOR_ROLE:
      return "Оператор филиала";
  }
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
