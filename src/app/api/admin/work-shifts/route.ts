import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
  canReviewShifts,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { formatDateKey } from "@/lib/time";
import { getBranchPlannedWindow } from "@/lib/payroll/branch-planned-window";
import { aggregatePeriodReport, summaryToPeriodRow } from "@/lib/payroll/period-report";
import {
  enrichShiftResponse,
  SHIFT_INCLUDE,
  computeShiftSummary,
} from "@/lib/payroll/work-shift-service";
import {
  previousDateKey,
  saveHandoffNote,
} from "@/lib/payroll/shift-baseline-tasks";

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  handoffComment: z.string().optional(),
  branchId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") ?? formatDateKey(new Date());
    const branchId = resolveBranchFilter(ctx, searchParams.get("branchId"));
    const memberId = searchParams.get("memberId");
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const queue = searchParams.get("queue");

    if (queue === "review") {
      if (!canReviewShifts(ctx)) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      const today = formatDateKey(new Date());
      const reviewTo = to ?? today;
      const dateFilter: { gte?: string; lte?: string } = { lte: reviewTo };
      if (from) dateFilter.gte = from;

      const reviewBranchId = resolveBranchFilter(ctx, searchParams.get("branchId"));

      const shifts = await prisma.workShift.findMany({
        where: {
          organizationId: ctx.organizationId,
          date: dateFilter,
          ...(reviewBranchId ? { branchId: reviewBranchId } : {}),
          OR: [
            { status: "closed" },
            { status: "open", date: { lt: today } },
          ],
        },
        include: SHIFT_INCLUDE,
        orderBy: [{ date: "desc" }, { actualStart: "desc" }],
      });

      const enriched = await Promise.all(shifts.map((s) => enrichShiftResponse(s)));
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
          status: { in: ["closed", "approved"] },
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

    const enriched = await Promise.all(shifts.map((s) => enrichShiftResponse(s)));

    const mine = enriched.find((e) => e.shift.memberId === ctx.memberId) ?? null;

    return NextResponse.json({ shifts: enriched, today: mine, date });
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
    const branchId = ctx.branchId ?? body.branchId ?? null;
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
        const now = new Date();
        await prisma.workShift.update({
          where: { id: existing.id },
          data: { status: "open", actualStart: now },
        });
        if (existing.plannedStaffId && !existing.workAsAdmin) {
          await prisma.reverseAssignment.create({
            data: {
              shiftId: existing.id,
              staffId: existing.plannedStaffId,
              startedAt: now,
            },
          });
        }
        const updated = await prisma.workShift.findUnique({
          where: { id: existing.id },
          include: SHIFT_INCLUDE,
        });
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
    const now = new Date();

    const shift = await prisma.workShift.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        memberId: ctx.memberId,
        date,
        plannedStart: planned.start,
        plannedEnd: planned.end,
        actualStart: now,
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
