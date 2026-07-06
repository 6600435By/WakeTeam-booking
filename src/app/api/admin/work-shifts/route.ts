import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleAdminError,
  requireAdminContext,
  resolveManagementBranchFilter,
  canReviewShifts,
  canApproveShift,
  canViewBranchShiftSummary,
  BRANCH_OPERATOR_ROLE,
  BRANCH_ADMIN_ROLE,
  BRANCH_MANAGER_ROLE,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { formatDateKey, parseTimeOnDate } from "@/lib/time";
import { logShiftOpen } from "@/lib/audit/shift-audit";
import { getBranchPlannedWindow } from "@/lib/payroll/branch-planned-window";
import { aggregatePeriodReport, summaryToPeriodRow } from "@/lib/payroll/period-report";
import {
  enrichShiftResponse,
  SHIFT_INCLUDE,
  computeShiftSummary,
  type ShiftWithRelations,
} from "@/lib/payroll/work-shift-service";
import {
  previousDateKey,
  saveHandoffNote,
} from "@/lib/payroll/shift-baseline-tasks";

function enrichOptionsForViewer(
  ctx: Awaited<ReturnType<typeof requireAdminContext>>,
) {
  return { includeBranchDaySummary: canViewBranchShiftSummary(ctx) };
}

async function enrichMany(
  shifts: ShiftWithRelations[],
  ctx: Awaited<ReturnType<typeof requireAdminContext>>,
) {
  const opts = enrichOptionsForViewer(ctx);
  return Promise.all(
    shifts.map((s) =>
      enrichShiftResponse(s as NonNullable<ShiftWithRelations>, new Date(), opts),
    ),
  );
}

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  handoffComment: z.string().optional(),
  branchId: z.string().optional(),
  actualStart: z.string().optional(),
});

function resolveActualStart(date: string, raw?: string): Date {
  const now = new Date();
  if (!raw?.trim()) return now;
  if (raw.includes("T")) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (match) {
    const h = match[1].padStart(2, "0");
    const m = match[2];
    return parseTimeOnDate(date, `${h}:${m}`);
  }
  return now;
}

function validateActualStart(date: string, start: Date, plannedStart?: string | null): string | null {
  const now = new Date();
  if (start.getTime() > now.getTime() + 60_000) {
    return "Время начала не может быть в будущем";
  }
  if (plannedStart) {
    const planned = parseTimeOnDate(date, plannedStart);
    const minStart = new Date(planned.getTime() - 2 * 60 * 60_000);
    if (start.getTime() < minStart.getTime()) {
      return "Слишком раннее время начала смены";
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") ?? formatDateKey(new Date());
    const branchId = resolveManagementBranchFilter(ctx, searchParams.get("branchId"));
    const memberId = searchParams.get("memberId");
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const queue = searchParams.get("queue");

    const mineParam = searchParams.get("mine");

    if (queue === "review") {
      if (!canReviewShifts(ctx)) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      const today = formatDateKey(new Date());
      const reviewTo = to ?? today;
      const dateFilter: { gte?: string; lte?: string } = { lte: reviewTo };
      if (from) dateFilter.gte = from;

      const reviewBranchId = resolveManagementBranchFilter(ctx, searchParams.get("branchId"));
    const memberIdsParam = searchParams.get("memberIds");
    const memberIds = memberIdsParam
      ? memberIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

      const shifts = await prisma.workShift.findMany({
        where: {
          organizationId: ctx.organizationId,
          date: dateFilter,
          ...(reviewBranchId ? { branchId: reviewBranchId } : {}),
          ...(memberIds?.length ? { memberId: { in: memberIds } } : {}),
          ...(ctx.isBranchAdmin && !ctx.isSuperAdmin
            ? { member: { role: BRANCH_OPERATOR_ROLE } }
            : {}),
          OR: [
            { status: "closed" },
            { status: "open", date: { lt: today } },
          ],
        },
        include: SHIFT_INCLUDE,
        orderBy: [{ date: "desc" }, { actualStart: "desc" }],
      });

      const enriched = await enrichMany(
        shifts
          .filter((s) =>
            ctx.isSuperAdmin ||
            canApproveShift(ctx, s.member.role, s.branchId),
          ),
        ctx,
      );
      return NextResponse.json({ shifts: enriched });
    }

    if (from && to && mineParam === "1") {
      const shifts = await prisma.workShift.findMany({
        where: {
          memberId: ctx.memberId,
          date: { gte: from, lte: to },
        },
        include: SHIFT_INCLUDE,
        orderBy: { date: "desc" },
      });
      const enriched = await enrichMany(shifts, ctx);
      return NextResponse.json({ shifts: enriched });
    }

    if (from && to) {
      const targetMemberId =
        memberId && canReviewShifts(ctx)
          ? memberId
          : ctx.memberId;
      if (memberId && memberId !== ctx.memberId && !canReviewShifts(ctx)) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      const shifts = await prisma.workShift.findMany({
        where: {
          memberId: targetMemberId,
          date: { gte: from, lte: to },
          status: { in: ["closed", "approved", "open"] },
        },
        include: SHIFT_INCLUDE,
        orderBy: { date: "asc" },
      });
      const rows = await Promise.all(
        shifts.map(async (s) => {
          const summary = await computeShiftSummary(s);
          return summaryToPeriodRow(s.id, s.date, s.status, summary);
        }),
      );
      return NextResponse.json(aggregatePeriodReport(from, to, rows));
    }

    const where: Record<string, unknown> = { date };
    if (branchId) where.branchId = branchId;
    if (status) where.status = status;

    if (canReviewShifts(ctx)) {
      if (memberId) where.memberId = memberId;
    } else {
      where.memberId = ctx.memberId;
    }

    const shifts = await prisma.workShift.findMany({
      where,
      include: SHIFT_INCLUDE,
      orderBy: { actualStart: "desc" },
    });

    const enriched = await enrichMany(shifts, ctx);

    const todayShift = enriched.find((e) => e.shift.memberId === ctx.memberId) ?? null;

    return NextResponse.json({ shifts: enriched, today: todayShift, date });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const body = createSchema.parse(await req.json().catch(() => ({})));
    const date = body.date ?? formatDateKey(new Date());
    let branchId = ctx.branchId ?? body.branchId ?? null;
    if (ctx.isBranchManager) {
      branchId = body.branchId ?? ctx.branchId ?? ctx.managedBranchIds[0] ?? null;
      if (branchId && !ctx.managedBranchIds.includes(branchId)) {
        return NextResponse.json({ error: "Нет доступа к филиалу" }, { status: 403 });
      }
    }
    if (!branchId) {
      return NextResponse.json(
        { error: "Выберите филиал для смены" },
        { status: 400 },
      );
    }

    const existing = await prisma.workShift.findUnique({
      where: { memberId_date: { memberId: ctx.memberId, date } },
      include: SHIFT_INCLUDE,
    });
    if (existing) {
      if (existing.status === "open") {
        return NextResponse.json(await enrichShiftResponse(existing));
      }
      if (existing.status === "scheduled") {
        const planned = await getBranchPlannedWindow(existing.branchId, date);
        const actualStart = resolveActualStart(date, body.actualStart);
        const startErr = validateActualStart(
          date,
          actualStart,
          existing.plannedStart ?? planned.start,
        );
        if (startErr) {
          return NextResponse.json({ error: startErr }, { status: 400 });
        }
        await prisma.workShift.update({
          where: { id: existing.id },
          data: { status: "open", actualStart },
        });
        if (existing.plannedStaffId) {
          await prisma.reverseAssignment.create({
            data: {
              shiftId: existing.id,
              staffId: existing.plannedStaffId,
              startedAt: actualStart,
            },
          });
        }
        const updated = await prisma.workShift.findUnique({
          where: { id: existing.id },
          include: SHIFT_INCLUDE,
        });
        if (updated) {
          const branch = await prisma.branch.findUnique({
            where: { id: existing.branchId },
            select: { name: true },
          });
          logShiftOpen(ctx, {
            shiftId: updated.id,
            branchId: updated.branchId,
            memberUser: updated.member.user,
            branchName: branch?.name ?? updated.member.branch?.name ?? "филиал",
            actualStart,
          });
        }
        if (body.handoffComment?.trim()) {
          await saveHandoffNote({
            organizationId: ctx.organizationId,
            branchId: existing.branchId,
            targetDate: previousDateKey(date),
            workShiftId: existing.id,
            memberId: ctx.memberId,
            comment: body.handoffComment,
          });
        }
        return NextResponse.json(await enrichShiftResponse(updated!));
      }
      return NextResponse.json(
        { error: "Смена на этот день уже закрыта" },
        { status: 400 },
      );
    }

    const planned = await getBranchPlannedWindow(branchId, date);
    const actualStart = resolveActualStart(date, body.actualStart);
    const startErr = validateActualStart(date, actualStart, planned.start);
    if (startErr) {
      return NextResponse.json({ error: startErr }, { status: 400 });
    }

    const shift = await prisma.workShift.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        memberId: ctx.memberId,
        date,
        plannedStart: planned.start,
        plannedEnd: planned.end,
        actualStart,
        status: "open",
      },
      include: SHIFT_INCLUDE,
    });

    if (body.handoffComment?.trim()) {
      await saveHandoffNote({
        organizationId: ctx.organizationId,
        branchId,
        targetDate: previousDateKey(date),
        workShiftId: shift.id,
        memberId: ctx.memberId,
        comment: body.handoffComment,
      });
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { name: true },
    });
    logShiftOpen(ctx, {
      shiftId: shift.id,
      branchId,
      memberUser: shift.member.user,
      branchName: branch?.name ?? shift.member.branch?.name ?? "филиал",
      actualStart,
    });

    return NextResponse.json(await enrichShiftResponse(shift));
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
