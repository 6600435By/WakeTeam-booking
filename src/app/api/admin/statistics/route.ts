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

const TABLE_TAKE = 500;

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    assertStatisticsAccess(ctx);
    const filters = parseFilters(req);
    const where = buildStatisticsWhere(ctx, filters);
    const branchId = resolveBranchFilter(ctx, filters.branchId);
    const includeOptions = req.nextUrl.searchParams.get("options") !== "0";

    const [summaryAgg, seriesRows, appointments, optionPack] = await Promise.all([
      prisma.appointment.aggregate({
        where,
        _count: { _all: true },
        _sum: { price: true, durationMinutes: true },
      }),
      prisma.appointment.findMany({
        where,
        select: { startAt: true, price: true, durationMinutes: true },
        orderBy: { startAt: "asc" },
      }),
      prisma.appointment.findMany({
        where,
        select: {
          id: true,
          publicNumber: true,
          startAt: true,
          createdAt: true,
          status: true,
          price: true,
          durationMinutes: true,
          paymentMethod: true,
          cashAmount: true,
          cardAmount: true,
          comment: true,
          cancelReason: true,
          source: true,
          branchId: true,
          client: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          },
          service: { select: { name: true } },
          staff: { select: { name: true } },
        },
        orderBy: { startAt: "desc" },
        take: TABLE_TAKE,
      }),
      includeOptions
        ? Promise.all([
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
          ])
        : Promise.resolve(null),
    ]);

    const summary = {
      count: summaryAgg._count._all,
      totalPrice: summaryAgg._sum.price ?? 0,
      totalDurationMinutes: summaryAgg._sum.durationMinutes ?? 0,
    };

    const series = aggregateByDay(seriesRows, filters.dateFrom, filters.dateTo);

    const options = optionPack
      ? {
          branches: optionPack[0],
          staff: optionPack[1],
          services: optionPack[2],
          isSuperAdmin: ctx.isSuperAdmin,
          lockedBranchId: ctx.isSuperAdmin ? null : ctx.branchId,
        }
      : undefined;

    return NextResponse.json({
      filters,
      summary,
      series,
      appointments,
      truncated: summary.count > appointments.length,
      options,
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json(
        { error: handled.error, ...(handled.hint ? { hint: handled.hint } : {}) },
        { status: handled.status },
      );
    }
    console.error(e);
    return NextResponse.json(
      {
        error: "Не удалось выполнить действие",
        hint: "Обновите страницу и повторите действие. Если ошибка повторяется — перелогиньтесь или обратитесь к администратору.",
      },
      { status: 500 },
    );
  }
}
