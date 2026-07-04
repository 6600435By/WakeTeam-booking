import type { AdminContext } from "@/lib/admin-access";
import { fireAdminActivityFromContext, truncateSummary } from "@/lib/audit/admin-activity-log";
import { staffDisplayName } from "@/lib/staff-user";
import { TZ } from "@/lib/time";
import { formatInTimeZone } from "date-fns-tz";

type ShiftUser = {
  name: string | null;
  lastName: string | null;
  login: string;
  email?: string | null;
};

function formatShiftTime(d: Date): string {
  return formatInTimeZone(d, TZ, "HH:mm");
}

export function logShiftOpen(
  ctx: AdminContext,
  params: {
    shiftId: string;
    branchId: string;
    memberUser: ShiftUser;
    branchName: string;
    actualStart: Date;
  },
): void {
  const memberName = staffDisplayName(params.memberUser);
  fireAdminActivityFromContext(ctx, {
    action: "shift.open",
    branchId: params.branchId,
    entityType: "work_shift",
    entityId: params.shiftId,
    summary: truncateSummary(
      `Смена открыта: ${memberName}, ${params.branchName}, ${formatShiftTime(params.actualStart)}`,
    ),
  });
}

export function logShiftClose(
  ctx: AdminContext,
  params: {
    shiftId: string;
    branchId: string;
    memberUser: ShiftUser;
    branchName: string;
    actualEnd: Date;
  },
): void {
  const memberName = staffDisplayName(params.memberUser);
  fireAdminActivityFromContext(ctx, {
    action: "shift.close",
    branchId: params.branchId,
    entityType: "work_shift",
    entityId: params.shiftId,
    summary: truncateSummary(
      `Смена закрыта: ${memberName}, ${params.branchName}, ${formatShiftTime(params.actualEnd)}`,
    ),
  });
}

export function logShiftAssign(
  ctx: AdminContext,
  params: {
    shiftId: string;
    branchId: string;
    memberName: string;
    staffNames: string[];
  },
): void {
  const reverses =
    params.staffNames.length > 0 ? params.staffNames.join(", ") : "без реверса";
  fireAdminActivityFromContext(ctx, {
    action: "shift.assign",
    branchId: params.branchId,
    entityType: "work_shift",
    entityId: params.shiftId,
    summary: truncateSummary(`Назначение: ${params.memberName} → ${reverses}`),
  });
}

export function logScheduleBranch(
  ctx: AdminContext,
  params: {
    branchId: string;
    branchName: string;
    timeFrom: string;
    timeTo: string;
    prevFrom?: string | null;
    prevTo?: string | null;
  },
): void {
  const window = `${params.timeFrom}–${params.timeTo}`;
  const summary =
    params.prevFrom && params.prevTo
      ? `График филиала ${params.branchName}: ${params.prevFrom}–${params.prevTo} → ${window}`
      : `График филиала ${params.branchName}: ${window}`;
  fireAdminActivityFromContext(ctx, {
    action: "schedule.branch",
    branchId: params.branchId,
    summary: truncateSummary(summary),
  });
}

export function logScheduleResource(
  ctx: AdminContext,
  params: {
    branchId: string;
    staffName: string;
    isWorking: boolean;
    timeFrom?: string;
    timeTo?: string;
  },
): void {
  const summary = params.isWorking
    ? `${params.staffName}: ${params.timeFrom ?? "10:00"}–${params.timeTo ?? "22:00"}`
    : `${params.staffName}: не работает сегодня`;
  fireAdminActivityFromContext(ctx, {
    action: "schedule.resource",
    branchId: params.branchId,
    entityType: "service",
    summary: truncateSummary(summary),
  });
}

export function logScheduleService(
  ctx: AdminContext,
  params: {
    branchId: string;
    serviceName: string;
    parts: string[];
  },
): void {
  fireAdminActivityFromContext(ctx, {
    action: "schedule.service",
    branchId: params.branchId,
    entityType: "service",
    summary: truncateSummary(`Услуга ${params.serviceName}: ${params.parts.join(", ")}`),
  });
}
