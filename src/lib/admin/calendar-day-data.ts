import {
  branchListWhere,
  type AdminContext,
  resolveBranchFilter,
} from "@/lib/admin-access";
import { JOURNAL_HIDDEN_STATUSES } from "@/lib/appointment-status";
import { prisma } from "@/lib/db";
import { formatDateKey, parseTimeOnDate } from "@/lib/time";

export async function queryCalendarDay(
  ctx: AdminContext,
  date: string,
  requestedBranchId?: string | null,
) {
  const branchId = resolveBranchFilter(ctx, requestedBranchId);

  const dayStart = parseTimeOnDate(date, "00:00");
  const nextDate = new Date(
    parseTimeOnDate(date, "12:00").getTime() + 24 * 60 * 60 * 1000,
  );
  const nextKey = formatDateKey(nextDate);
  const dayEnd = parseTimeOnDate(nextKey, "00:00");

  const [staff, appointments, branches] = await Promise.all([
    prisma.staff.findMany({
      where: {
        isActive: true,
        organizationId: ctx.organizationId,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: { schedules: true, branch: true },
    }),
    prisma.appointment.findMany({
      where: {
        organizationId: ctx.organizationId,
        startAt: { gte: dayStart, lt: dayEnd },
        ...(branchId ? { branchId } : {}),
        status: { notIn: [...JOURNAL_HIDDEN_STATUSES] },
      },
      include: {
        client: true,
        service: true,
        staff: true,
        rentalItem: true,
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.branch.findMany({
      where: branchListWhere(ctx),
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return {
    staff,
    appointments,
    branches,
    date,
    admin: {
      role: ctx.role,
      branchId: ctx.branchId,
      isSuperAdmin: ctx.isSuperAdmin,
    },
  };
}

export async function queryAppointmentsList(
  ctx: AdminContext,
  from: string,
  to: string,
  requestedBranchId?: string | null,
) {
  const branchId = resolveBranchFilter(ctx, requestedBranchId);
  const dayStart = parseTimeOnDate(from, "00:00");
  const toDate = parseTimeOnDate(to, "12:00");
  toDate.setDate(toDate.getDate() + 1);
  const nextKey = formatDateKey(toDate);
  const dayEnd = parseTimeOnDate(nextKey, "00:00");

  return prisma.appointment.findMany({
    where: {
      organizationId: ctx.organizationId,
      startAt: { gte: dayStart, lt: dayEnd },
      ...(branchId ? { branchId } : {}),
    },
    include: {
      client: true,
      service: true,
      staff: true,
      rentalItem: true,
    },
    orderBy: { startAt: "desc" },
  });
}

export function resolveInitialBranchId(
  ctx: AdminContext,
  branches: { id: string }[],
  requested?: string,
): string {
  if (!ctx.isSuperAdmin && ctx.branchId) return ctx.branchId;
  if (requested && branches.some((b) => b.id === requested)) return requested;
  return branches[0]?.id ?? "";
}
