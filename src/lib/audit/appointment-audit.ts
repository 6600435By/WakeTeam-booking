import type { AdminContext } from "@/lib/admin-access";
import {
  fireAdminActivityLog,
  fireAdminActivityFromContext,
  truncateSummary,
} from "@/lib/audit/admin-activity-log";
import { staffDisplayName } from "@/lib/staff-user";

export type AppointmentAuditRow = {
  id: string;
  publicNumber: number | null;
  branchId: string;
  startAt: Date;
  endAt: Date;
  status: string;
  durationMinutes: number;
  price: number;
  staffId: string;
  serviceId: string;
  operatorMemberId: string | null;
  client?: { firstName: string | null; lastName: string | null; phone: string } | null;
  service?: { name: string } | null;
  staff?: { name: string } | null;
  operatorMember?: {
    user: { name: string | null; lastName: string | null; login: string | null };
  } | null;
};

export type AppointmentAuditLabels = {
  staffNames?: Record<string, string>;
  serviceNames?: Record<string, string>;
  operatorNames?: Record<string, string>;
};

function apptNumber(publicNumber: number | null): string {
  return publicNumber != null ? `#${publicNumber}` : "запись";
}

function clientLabel(client?: AppointmentAuditRow["client"]): string {
  if (!client) return "";
  const name = [client.lastName, client.firstName].filter(Boolean).join(" ");
  return name || client.phone;
}

function appointmentDetails(row: AppointmentAuditRow): string[] {
  const parts: string[] = [];
  const client = row.client;
  if (client) {
    const name = clientLabel(client);
    if (name) parts.push(`клиент ${name}`);
    if (client.phone) parts.push(`тел ${client.phone}`);
  }
  if (row.staff?.name) parts.push(`ресурс ${row.staff.name}`);
  parts.push(`${row.price} BYN`);
  return parts;
}

function appendAppointmentDetails(row: AppointmentAuditRow, parts: string[]): string[] {
  const details = appointmentDetails(row);
  if (details.length === 0) return parts;
  return [...parts, ...details];
}

function operatorLabel(
  id: string | null,
  row?: AppointmentAuditRow["operatorMember"],
  names?: Record<string, string>,
): string {
  if (!id) return "—";
  if (row?.user) return staffDisplayName(row.user);
  return names?.[id] ?? id;
}

export function summarizeAppointmentCreate(row: AppointmentAuditRow): string {
  const parts = appendAppointmentDetails(row, [
    apptNumber(row.publicNumber),
    row.service?.name ?? "услуга",
  ]);
  return truncateSummary(`Создал ${parts.join(", ")}`);
}

export function summarizeAppointmentPatch(
  before: AppointmentAuditRow,
  after: AppointmentAuditRow,
  labels: AppointmentAuditLabels = {},
): string | null {
  const changes: string[] = [];

  if (before.staffId !== after.staffId) {
    const from = before.staff?.name ?? labels.staffNames?.[before.staffId] ?? before.staffId;
    const to = after.staff?.name ?? labels.staffNames?.[after.staffId] ?? after.staffId;
    changes.push(`ресурс ${from}→${to}`);
  }

  if (before.serviceId !== after.serviceId) {
    const from = before.service?.name ?? labels.serviceNames?.[before.serviceId] ?? before.serviceId;
    const to = after.service?.name ?? labels.serviceNames?.[after.serviceId] ?? after.serviceId;
    changes.push(`услуга ${from}→${to}`);
  }

  if (before.status !== after.status) {
    changes.push(`статус ${before.status}→${after.status}`);
  }

  if (before.operatorMemberId !== after.operatorMemberId) {
    const from = operatorLabel(before.operatorMemberId, before.operatorMember, labels.operatorNames);
    const to = operatorLabel(after.operatorMemberId, after.operatorMember, labels.operatorNames);
    changes.push(`оператор ${from}→${to}`);
  }

  if (before.price !== after.price) {
    changes.push(`цена ${before.price}→${after.price} BYN`);
  }

  if (before.durationMinutes !== after.durationMinutes) {
    changes.push(`длительность ${before.durationMinutes}→${after.durationMinutes}`);
  }

  if (changes.length === 0) return null;
  const parts = appendAppointmentDetails(after, [
    apptNumber(after.publicNumber),
    ...changes,
  ]);
  return truncateSummary(`Изменил ${parts.join(", ")}`);
}

export function summarizeAppointmentCancel(
  row: AppointmentAuditRow,
  reason?: string,
): string {
  const parts = appendAppointmentDetails(row, [
    apptNumber(row.publicNumber),
    reason ? `причина ${reason}` : null,
    row.service?.name,
  ].filter(Boolean) as string[]);
  return truncateSummary(`Удалил ${parts.join(", ")}`);
}

export function summarizeAppointmentOnline(row: AppointmentAuditRow): string {
  const parts = appendAppointmentDetails(row, [
    apptNumber(row.publicNumber),
    row.service?.name ?? "услуга",
  ]);
  return truncateSummary(`Онлайн ${parts.join(", ")}`);
}

export function logAppointmentCreate(ctx: AdminContext, row: AppointmentAuditRow): void {
  fireAdminActivityFromContext(ctx, {
    action: "appt.create",
    branchId: row.branchId,
    entityType: "appointment",
    entityId: row.id,
    summary: summarizeAppointmentCreate(row),
  });
}

export function logAppointmentUpdate(
  ctx: AdminContext,
  before: AppointmentAuditRow,
  after: AppointmentAuditRow,
  labels?: AppointmentAuditLabels,
): void {
  const summary = summarizeAppointmentPatch(before, after, labels);
  if (!summary) return;
  fireAdminActivityFromContext(ctx, {
    action: "appt.update",
    branchId: after.branchId,
    entityType: "appointment",
    entityId: after.id,
    summary,
  });
}

export function logAppointmentCancel(
  ctx: AdminContext,
  row: AppointmentAuditRow,
  reason?: string,
): void {
  fireAdminActivityFromContext(ctx, {
    action: "appt.cancel",
    branchId: row.branchId,
    entityType: "appointment",
    entityId: row.id,
    summary: summarizeAppointmentCancel(row, reason),
  });
}

export function logAppointmentCreateOnline(
  organizationId: string,
  branchId: string,
  row: AppointmentAuditRow,
): void {
  fireAdminActivityLog({
    organizationId,
    action: "appt.create.online",
    actorMemberId: null,
    actorName: "Онлайн",
    branchId,
    entityType: "appointment",
    entityId: row.id,
    summary: summarizeAppointmentOnline(row),
  });
}
