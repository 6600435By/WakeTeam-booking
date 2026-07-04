import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  BRANCH_ADMIN_ROLE,
  BRANCH_MANAGER_ROLE,
  BRANCH_OPERATOR_ROLE,
  canReviewShifts,
  handleAdminError,
  isInManagementScope,
  requireAdminContext,
  resolveManagementBranchFilter,
  canApproveShift,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import { buildPayrollReport, type PayrollShiftRow } from "@/lib/payroll/payroll-report";
import { summaryToPeriodRow } from "@/lib/payroll/period-report";
import {
  computeShiftSummary,
  SHIFT_INCLUDE,
} from "@/lib/payroll/work-shift-service";
import { resolveMonthlyRateForPeriod } from "@/lib/payroll/resolve-rates";
import { logPayrollConfirm } from "@/lib/audit/user-audit";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    if (!canReviewShifts(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to) {
      return NextResponse.json(
        { error: "Укажите период (from, to)" },
        { status: 400 },
      );
    }

    const branchId = resolveManagementBranchFilter(ctx, searchParams.get("branchId"));
    const memberIdsParam = searchParams.get("memberIds");
    const memberIds = memberIdsParam
      ? memberIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

    const employees = await prisma.organizationMember.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: {
          in: [BRANCH_OPERATOR_ROLE, BRANCH_ADMIN_ROLE, BRANCH_MANAGER_ROLE],
        },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        user: { select: { name: true, lastName: true, login: true, email: true } },
        branch: { select: { id: true, name: true } },
        payRates: true,
      },
      orderBy: { user: { name: "asc" } },
    });

    const where: Record<string, unknown> = {
      organizationId: ctx.organizationId,
      date: { gte: from, lte: to },
      status: { in: ["closed", "approved"] },
    };
    if (branchId) where.branchId = branchId;
    if (memberIds?.length) where.memberId = { in: memberIds };

    const shifts = await prisma.workShift.findMany({
      where,
      include: SHIFT_INCLUDE,
      orderBy: [{ date: "asc" }, { actualStart: "asc" }],
    });

    const filteredShifts = shifts.filter((s) =>
      ctx.isSuperAdmin || canApproveShift(ctx, s.member.role, s.branchId),
    );

    const rows: PayrollShiftRow[] = await Promise.all(
      filteredShifts.map(async (s) => {
        const spotMode = s.status === "approved" ? "payroll" : "preview";
        const summary = await computeShiftSummary(s, new Date(), { spotMode });
        const period = summaryToPeriodRow(s.id, s.date, s.status, summary);
        return {
          ...period,
          memberId: s.memberId,
          memberName: staffDisplayName(s.member.user),
          branchId: s.branchId,
          branchName: s.member.branch?.name ?? null,
          role: s.member.role,
          actualStart: s.actualStart?.toISOString() ?? null,
          actualEnd: s.actualEnd?.toISOString() ?? null,
          lines: summary.lines,
          isOperator: summary.isOperator,
        };
      }),
    );

    const report = buildPayrollReport(from, to, rows);

    const monthlyAccruals = await prisma.payrollMonthlyAccrual.findMany({
      where: {
        organizationId: ctx.organizationId,
        periodFrom: from,
        periodTo: to,
        memberId: { in: employees.map((e) => e.id) },
      },
    });
    const accrualByMember = new Map(monthlyAccruals.map((a) => [a.memberId, a]));

    const monthlyLines = employees
      .map((m) => {
        const suggested = resolveMonthlyRateForPeriod(m.payRates, from, to);
        if (suggested == null) return null;
        const accrual = accrualByMember.get(m.id);
        return {
          memberId: m.id,
          memberName: staffDisplayName(m.user),
          role: m.role,
          suggestedAmount: suggested,
          confirmedAmount: accrual?.confirmedAmount ?? null,
          comment: accrual?.comment ?? null,
          confirmedAt: accrual?.confirmedAt?.toISOString() ?? null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      ...report,
      monthlyLines,
      employees: employees.map((m) => ({
        memberId: m.id,
        name: staffDisplayName(m.user),
        role: m.role,
        branchId: m.branchId,
        branchName: m.branch?.name ?? null,
      })),
      branches: branchId
        ? []
        : await prisma.branch.findMany({
            where: { organizationId: ctx.organizationId },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error("[payroll-report]", e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

const monthlySchema = z.object({
  memberId: z.string(),
  periodFrom: z.string(),
  periodTo: z.string(),
  confirmedAmount: z.number().nonnegative(),
  comment: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    if (!canReviewShifts(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const body = monthlySchema.parse(await req.json());

    const member = await prisma.organizationMember.findUnique({
      where: { id: body.memberId },
      include: {
        payRates: true,
        branchScopes: { select: { branchId: true } },
        user: { select: { name: true, lastName: true, login: true } },
      },
    });
    if (!member || member.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    if (!ctx.isSuperAdmin) {
      const branchIds = new Set<string>();
      if (member.branchId) branchIds.add(member.branchId);
      for (const s of member.branchScopes) branchIds.add(s.branchId);
      const inScope = [...branchIds].some((id) => isInManagementScope(ctx, id));
      if (!inScope) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
    }

    const suggestedAmount =
      resolveMonthlyRateForPeriod(member.payRates, body.periodFrom, body.periodTo) ?? 0;

    const accrual = await prisma.payrollMonthlyAccrual.upsert({
      where: {
        memberId_periodFrom_periodTo: {
          memberId: body.memberId,
          periodFrom: body.periodFrom,
          periodTo: body.periodTo,
        },
      },
      create: {
        organizationId: ctx.organizationId,
        memberId: body.memberId,
        periodFrom: body.periodFrom,
        periodTo: body.periodTo,
        suggestedAmount,
        confirmedAmount: body.confirmedAmount,
        comment: body.comment?.trim() || null,
        confirmedAt: new Date(),
        confirmedByMemberId: ctx.memberId,
      },
      update: {
        confirmedAmount: body.confirmedAmount,
        comment: body.comment?.trim() || null,
        confirmedAt: new Date(),
        confirmedByMemberId: ctx.memberId,
        suggestedAmount,
      },
    });

    logPayrollConfirm(ctx, {
      memberId: body.memberId,
      memberUser: member.user,
      periodFrom: body.periodFrom,
      periodTo: body.periodTo,
      confirmedAmount: body.confirmedAmount,
      branchId: member.branchId,
    });

    return NextResponse.json({ ok: true, accrual });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
