import type { User } from "@prisma/client";
import { getSessionUser } from "./auth";
import { prisma } from "./db";

export const SUPER_ADMIN_ROLE = "super_admin";
export const BRANCH_ADMIN_ROLE = "branch_admin";

export type AdminContext = {
  user: User;
  organizationId: string;
  role: typeof SUPER_ADMIN_ROLE | typeof BRANCH_ADMIN_ROLE;
  branchId: string | null;
  branchName: string | null;
  isSuperAdmin: boolean;
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

  const isSuperAdmin =
    membership.role === SUPER_ADMIN_ROLE || membership.role === "admin";
  if (!isSuperAdmin && !membership.branchId) return null;

  return {
    user,
    organizationId: membership.organizationId,
    role: isSuperAdmin ? SUPER_ADMIN_ROLE : BRANCH_ADMIN_ROLE,
    branchId: membership.branchId,
    branchName: membership.branch?.name ?? null,
    isSuperAdmin,
  };
}

export async function requireAdminContext(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) throw new AdminAccessError("UNAUTHORIZED", 401);
  return ctx;
}

export function assertBranchAccess(ctx: AdminContext, branchId: string) {
  if (ctx.isSuperAdmin) return;
  if (ctx.branchId !== branchId) {
    throw new AdminAccessError("FORBIDDEN", 403);
  }
}

/** Для branch_admin всегда возвращает его филиал; для super — из запроса или null (все). */
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

export function handleAdminError(e: unknown) {
  if (e instanceof AdminAccessError) {
    if (e.message === "UNAUTHORIZED") {
      return { status: 401, error: "Unauthorized" };
    }
    if (e.message === "NOT_FOUND") {
      return { status: 404, error: "Not found" };
    }
    return { status: e.status, error: "Нет доступа к этому филиалу" };
  }
  if (e instanceof Error && e.message === "UNAUTHORIZED") {
    return { status: 401, error: "Unauthorized" };
  }
  return null;
}
