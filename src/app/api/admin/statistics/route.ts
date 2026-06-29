import { NextRequest, NextResponse } from "next/server";
import {
  assertStatisticsAccess,
  branchListWhere,
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
} from "@/lib/admin-access";
import {
  aggregateByDay,
  buildStatisticsWhere,
  type StatisticsFilters,
} from "@/lib/admin-statistics";
import { prisma } from "@/lib/db";
import { periodToday, todayDateKey } from "@/lib/date-ranges";

function defaultDateTo() {
  return todayDateKey();
}

function defaultDateFrom() {
  return periodToday().from;
}

function parseFilters(req: NextRequest): StatisticsFilters {
  const p = req.nextUrl.searchParams;
  return {
    dateFrom: p.get("dateFrom") || defaultDateFrom(),
    dateTo: p.get("dateTo") || defaultDateTo(),
    createdFrom: p.get("createdFrom") || undefined,
    createdTo: p.get("createdTo") || undefined,
    publicNumber: p.get("publicNumber") || undefined,
    clientName: p.get("clientName") || undefined,
    phone: p.get("phone") || undefined,
    email: p.get("email") || undefined,
    comment: p.get("comment") || undefined,
    status: p.get("status") || undefined,
    branchId: p.get("branchId") || undefined,
    staffId: p.get("staffId") || undefined,
    serviceId: p.get("serviceId") || undefined,
    source: p.get("source") || undefined,
    cancelReason: p.get("cancelReason") || undefined,
    paymentMethod: p.get("paymentMethod") || undefined,
  };
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    assertStatisticsAccess(ctx);
    const filters = parseFilters(req);
    const where = buildStatisticsWhere(ctx, filters);
    const branchId = resolveBranchFilter(ctx, filters.branchId);

    const [appointments, branches, staff, services] = await Promise.all([
      prisma.appointment.findMany({
        where,
        include: {
          client: true,
          service: true,
          staff: true,
        },
        orderBy: { startAt: "desc" },
        take: 1000,
      }),
      prisma.branch.findMany({
        where: branchListWhere(ctx),
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
      prisma.staff.findMany({
        where: {
          organizationId: ctx.organizationId,
          isActive: true,
          ...(branchId ? { branchId } : {}),
        },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, branchId: true },
      }),
      prisma.service.findMany({
        where: {
          isActive: true,
          ...(branchId
            ? { branchId }
            : { branch: { organizationId: ctx.organizationId } }),
        },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, branchId: true },
      }),
    ]);

    const summary = appointments.reduce(
      (acc, a) => {
        acc.count += 1;
        acc.totalPrice += a.price;
        acc.totalDurationMinutes += a.durationMinutes;
        return acc;
      },
      { count: 0, totalPrice: 0, totalDurationMinutes: 0 },
    );

    const series = aggregateByDay(
      appointments.map((a) => ({
        startAt: a.startAt,
        price: a.price,
        durationMinutes: a.durationMinutes,
      })),
      filters.dateFrom,
      filters.dateTo,
    );

    return NextResponse.json({
      filters,
      summary,
      series,
      appointments,
      options: {
        branches,
        staff,
        services,
        isSuperAdmin: ctx.isSuperAdmin,
        lockedBranchId: ctx.isSuperAdmin ? null : ctx.branchId,
      },
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
