import {
  branchListWhere,
  type AdminContext,
  canCreateJournalInBranch,
  canEditJournalInBranch,
  canEditJournalAppointments,
  isInManagementScope,
  resolveJournalBranchFilter,
} from "@/lib/admin-access";
import { JOURNAL_HIDDEN_STATUSES } from "@/lib/appointment-status";
import { isLegacyTariffServiceName } from "@/lib/admin/service-catalog";
import { prisma } from "@/lib/db";
import { effectiveSchedulesForDay } from "@/lib/staff-schedule-effective";
import { formatDateKey, parseTimeOnDate, weekdayMinsk } from "@/lib/time";

function dayBounds(date: string) {
  const dayStart = parseTimeOnDate(date, "00:00");
  const nextDate = new Date(
    parseTimeOnDate(date, "12:00").getTime() + 24 * 60 * 60 * 1000,
  );
  const nextKey = formatDateKey(nextDate);
  const dayEnd = parseTimeOnDate(nextKey, "00:00");
  return { dayStart, dayEnd };
}

const appointmentDayInclude = {
  client: true,
  service: true,
  staff: true,
  rentalItem: true,
  operatorMember: {
    include: {
      user: { select: { name: true, lastName: true, login: true, email: true } },
    },
  },
} as const;

export async function queryCalendarDayAppointments(
  ctx: AdminContext,
  date: string,
  requestedBranchId?: string | null,
) {
  const branchId = resolveJournalBranchFilter(ctx, requestedBranchId);
  const { dayStart, dayEnd } = dayBounds(date);

  return prisma.appointment.findMany({
    where: {
      organizationId: ctx.organizationId,
      startAt: { gte: dayStart, lt: dayEnd },
      ...(branchId ? { branchId } : {}),
      status: { notIn: [...JOURNAL_HIDDEN_STATUSES] },
    },
    include: appointmentDayInclude,
    orderBy: { startAt: "asc" },
  });
}

export async function queryCalendarDay(
  ctx: AdminContext,
  date: string,
  requestedBranchId?: string | null,
) {
  const branchId = resolveJournalBranchFilter(ctx, requestedBranchId);

  const { dayStart, dayEnd } = dayBounds(date);

  const weekday = weekdayMinsk(date);

  const [staffRaw, appointments, branches, services, scheduleOverrides] =
    await Promise.all([
    prisma.staff.findMany({
      where: {
        isActive: true,
        organizationId: ctx.organizationId,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: { schedules: true, branch: true },
    }),
    queryCalendarDayAppointments(ctx, date, requestedBranchId),
    prisma.branch.findMany({
      where:
        ctx.isSuperAdmin || ctx.isBranchManager
          ? { organizationId: ctx.organizationId, isActive: true }
          : branchListWhere(ctx),
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.service.findMany({
      where: {
        isActive: true,
        ...(branchId ? { branchId } : { branch: { organizationId: ctx.organizationId } }),
      },
      orderBy: [{ branchId: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        name: true,
        kind: true,
        resourceLabel: true,
        isActive: true,
        branchId: true,
        staff: { select: { staffId: true } },
      },
    }),
    prisma.staffScheduleOverride.findMany({
      where: {
        date,
        staff: {
          isActive: true,
          organizationId: ctx.organizationId,
          ...(branchId ? { branchId } : {}),
        },
      },
    }),
  ]);

  const overrideByStaff = new Map(
    scheduleOverrides.map((row) => [row.staffId, row]),
  );

  const staff = staffRaw.map((row) => ({
    ...row,
    schedules: effectiveSchedulesForDay(
      row.schedules,
      overrideByStaff.get(row.id) ?? null,
      weekday,
    ),
  }));

  const catalogServices = services.filter((s) => !isLegacyTariffServiceName(s.name));

  return {
    staff,
    appointments,
    branches,
    services: catalogServices,
    date,
    admin: {
      role: ctx.role,
      branchId: ctx.branchId,
      isSuperAdmin: ctx.isSuperAdmin,
      isBranchManager: ctx.isBranchManager,
      managedBranchIds: ctx.managedBranchIds,
      canEditAppointments: canEditJournalAppointments(ctx),
      canEditAppointmentsInBranch: branchId
        ? canEditJournalInBranch(ctx, branchId)
        : canEditJournalAppointments(ctx),
      canCreateAppointmentsInBranch: branchId
        ? canCreateJournalInBranch(ctx, branchId)
        : true,
      journalReadOnlyOutsideScope:
        ctx.isBranchManager &&
        Boolean(branchId) &&
        !isInManagementScope(ctx, branchId!),
    },
  };
}

export async function queryAppointmentsList(
  ctx: AdminContext,
  from: string,
  to: string,
  requestedBranchId?: string | null,
) {
  const branchId = resolveJournalBranchFilter(ctx, requestedBranchId);
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
      operatorMember: {
        include: {
          user: { select: { name: true, lastName: true, login: true, email: true } },
        },
      },
    },
    orderBy: { startAt: "desc" },
  });
}

export async function queryJournalBranchesList(ctx: AdminContext) {
  return prisma.branch.findMany({
    where:
      ctx.isSuperAdmin || ctx.isBranchManager
        ? { organizationId: ctx.organizationId, isActive: true }
        : branchListWhere(ctx),
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
}

export function resolveInitialBranchId(
  ctx: AdminContext,
  branches: { id: string }[],
  requested?: string,
): string {
  if (ctx.isBranchManager) {
    if (requested && branches.some((b) => b.id === requested)) return requested;
    if (ctx.branchId && branches.some((b) => b.id === ctx.branchId)) {
      return ctx.branchId;
    }
    const scoped = ctx.managedBranchIds.find((id) =>
      branches.some((b) => b.id === id),
    );
    if (scoped) return scoped;
    return branches[0]?.id ?? "";
  }
  if (!ctx.isSuperAdmin && ctx.branchId) return ctx.branchId;
  if (requested && branches.some((b) => b.id === requested)) return requested;
  return branches[0]?.id ?? "";
}
