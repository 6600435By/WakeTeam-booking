import type { Prisma } from "@prisma/client";
import type { AdminContext } from "@/lib/admin-access";
import { resolveBranchFilter } from "@/lib/admin-access";
import type { DaySeriesPoint } from "@/lib/statistics-constants";
import { formatDateKey, parseTimeOnDate } from "@/lib/time";

export type StatisticsFilters = {
  dateFrom: string;
  dateTo: string;
  createdFrom?: string;
  createdTo?: string;
  publicNumber?: string;
  clientName?: string;
  phone?: string;
  email?: string;
  comment?: string;
  status?: string;
  branchId?: string;
  staffId?: string;
  serviceId?: string;
  source?: string;
  cancelReason?: string;
};

export function rangeBounds(from: string, to: string) {
  const dayStart = parseTimeOnDate(from, "00:00");
  const toDate = parseTimeOnDate(to, "12:00");
  toDate.setDate(toDate.getDate() + 1);
  const nextKey = formatDateKey(toDate);
  const dayEnd = parseTimeOnDate(nextKey, "00:00");
  return { dayStart, dayEnd };
}

export function buildStatisticsWhere(
  ctx: AdminContext,
  filters: StatisticsFilters,
): Prisma.AppointmentWhereInput {
  const branchId = resolveBranchFilter(ctx, filters.branchId);
  const { dayStart, dayEnd } = rangeBounds(filters.dateFrom, filters.dateTo);

  const where: Prisma.AppointmentWhereInput = {
    organizationId: ctx.organizationId,
    startAt: { gte: dayStart, lt: dayEnd },
    ...(branchId ? { branchId } : {}),
  };

  if (filters.createdFrom && filters.createdTo) {
    const created = rangeBounds(filters.createdFrom, filters.createdTo);
    where.createdAt = { gte: created.dayStart, lt: created.dayEnd };
  }

  if (filters.publicNumber) {
    const num = parseInt(filters.publicNumber, 10);
    if (!Number.isNaN(num)) where.publicNumber = num;
  }

  if (filters.status) where.status = filters.status;
  if (filters.staffId) where.staffId = filters.staffId;
  if (filters.serviceId) where.serviceId = filters.serviceId;
  if (filters.source) where.source = filters.source;
  if (filters.cancelReason) where.cancelReason = filters.cancelReason;

  if (filters.comment) {
    where.comment = { contains: filters.comment };
  }

  const clientFilters: Prisma.ClientWhereInput = {};
  if (filters.phone) clientFilters.phone = { contains: filters.phone };
  if (filters.email) clientFilters.email = { contains: filters.email };
  if (filters.clientName) {
    const parts = filters.clientName.trim().split(/\s+/);
    if (parts.length === 1) {
      clientFilters.OR = [
        { firstName: { contains: parts[0] } },
        { lastName: { contains: parts[0] } },
      ];
    } else {
      clientFilters.AND = [
        { firstName: { contains: parts[0] } },
        { lastName: { contains: parts.slice(1).join(" ") } },
      ];
    }
  }
  if (Object.keys(clientFilters).length > 0) {
    where.client = clientFilters;
  }

  return where;
}

export function aggregateByDay(
  rows: { startAt: Date; price: number; durationMinutes: number }[],
  dateFrom: string,
  dateTo: string,
): DaySeriesPoint[] {
  const map = new Map<string, DaySeriesPoint>();

  let cursor = parseTimeOnDate(dateFrom, "12:00");
  const end = parseTimeOnDate(dateTo, "12:00");
  while (cursor <= end) {
    const key = formatDateKey(cursor);
    map.set(key, { date: key, count: 0, price: 0, durationMinutes: 0 });
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  for (const row of rows) {
    const key = formatDateKey(row.startAt);
    const point = map.get(key);
    if (!point) continue;
    point.count += 1;
    point.price += row.price;
    point.durationMinutes += row.durationMinutes;
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
