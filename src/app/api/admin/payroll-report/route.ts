import { NextRequest, NextResponse } from "next/server";
import {
  BRANCH_ADMIN_ROLE,
  BRANCH_OPERATOR_ROLE,
  canReviewShifts,
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import { buildPayrollReport, type PayrollShiftRow } from "@/lib/payroll/payroll-report";
import { summaryToPeriodRow } from "@/lib/payroll/period-report";
import {
  computeShiftSummary,
  SHIFT_INCLUDE,
} from "@/lib/payroll/work-shift-service";

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

    const branchId = resolveBranchFilter(ctx, searchParams.get("branchId"));
    const memberIdsParam = searchParams.get("memberIds");
    const memberIds = memberIdsParam
      ? memberIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

    const employees = await prisma.organizationMember.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: { in: [BRANCH_OPERATOR_ROLE, BRANCH_ADMIN_ROLE] },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        user: { select: { name: true, lastName: true, login: true, email: true } },
        branch: { select: { id: true, name: true } },
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

    const rows: PayrollShiftRow[] = await Promise.all(
      shifts.map(async (s) => {
        const summary = await computeShiftSummary(s);
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

    return NextResponse.json({
      ...report,
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
