import type { AdminContext } from "@/lib/admin-access";
import {
  canApproveShift,
  BRANCH_OPERATOR_ROLE,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import {
  computeShiftSummary,
  SHIFT_INCLUDE,
} from "./work-shift-service";
import { buildPayrollReport, type PayrollShiftRow } from "./payroll-report";
import { summaryToPeriodRow } from "./period-report";

export type PayrollActionQueueItem = {
  shiftId: string;
  date: string;
  memberName: string;
  branchName: string | null;
  status: string;
  role: string;
  requiresSuperAdmin: boolean;
  hasHandoff: boolean;
  employeeSubmitted: boolean;
  unconfirmedSpotMinutes: number;
  previewAmount: number;
};

export type PayrollStats = {
  from: string;
  to: string;
  summary: {
    approvedAmount: number;
    pendingAmount: number;
    openShiftCount: number;
    approvedShiftCount: number;
    closedShiftCount: number;
    minutes: {
      panel: number;
      spot: number;
      idle: number;
      shift: number;
    };
  };
  actionQueue: PayrollActionQueueItem[];
  members: ReturnType<typeof buildPayrollReport>["members"];
  grandTotal: ReturnType<typeof buildPayrollReport>["grandTotal"];
  pendingGrandTotal: { amount: number; shiftCount: number };
};

export async function buildPayrollStats(input: {
  ctx: AdminContext;
  from: string;
  to: string;
  branchId?: string | null;
  memberIds?: string[] | null;
  status?: string | null;
  role?: string | null;
}): Promise<PayrollStats> {
  const { ctx, from, to, branchId, memberIds, status, role } = input;

  const where: Record<string, unknown> = {
    organizationId: ctx.organizationId,
    date: { gte: from, lte: to },
  };
  if (branchId) where.branchId = branchId;
  if (memberIds?.length) where.memberId = { in: memberIds };
  if (status) where.status = status;
  if (role) where.member = { role };
  if (ctx.isBranchAdmin && !ctx.isSuperAdmin) {
    where.branchId = ctx.branchId;
    where.member = { role: BRANCH_OPERATOR_ROLE };
  }

  const shifts = await prisma.workShift.findMany({
    where,
    include: SHIFT_INCLUDE,
    orderBy: [{ date: "asc" }, { actualStart: "asc" }],
  });

  const approvedRows: PayrollShiftRow[] = [];
  const pendingRows: PayrollShiftRow[] = [];
  const actionQueue: PayrollActionQueueItem[] = [];

  for (const s of shifts) {
    const canReview = canApproveShift(ctx, s.member.role, s.branchId);
    if (!ctx.isSuperAdmin && !canReview && s.memberId !== ctx.memberId) continue;

    const previewSummary = await computeShiftSummary(s, new Date(), {
      spotMode: "preview",
    });
    const payrollSummary =
      s.status === "approved"
        ? await computeShiftSummary(s, new Date(), { spotMode: "payroll" })
        : previewSummary;

    const row: PayrollShiftRow = {
      ...summaryToPeriodRow(s.id, s.date, s.status, payrollSummary),
      memberId: s.memberId,
      memberName: staffDisplayName(s.member.user),
      branchId: s.branchId,
      branchName: s.member.branch?.name ?? null,
      role: s.member.role,
      actualStart: s.actualStart?.toISOString() ?? null,
      actualEnd: s.actualEnd?.toISOString() ?? null,
      lines: payrollSummary.lines,
      isOperator: payrollSummary.isOperator,
    };

    if (s.status === "approved") {
      approvedRows.push(row);
    } else if (s.status === "closed") {
      pendingRows.push({
        ...row,
        totalAmount: previewSummary.totalAmount,
      });
    }

    if (
      canReview &&
      (s.status === "closed" || (s.status === "open" && s.date < to))
    ) {
      const handoff = await prisma.shiftHandoffNote.findFirst({
        where: { workShiftId: s.id },
      });
      actionQueue.push({
        shiftId: s.id,
        date: s.date,
        memberName: staffDisplayName(s.member.user),
        branchName: s.member.branch?.name ?? null,
        status: s.status,
        role: s.member.role,
        requiresSuperAdmin: s.member.role !== BRANCH_OPERATOR_ROLE,
        hasHandoff: Boolean(handoff?.comment?.trim()),
        employeeSubmitted: Boolean(s.employeeSubmittedAt),
        unconfirmedSpotMinutes: previewSummary.unconfirmedSpotMinutes ?? 0,
        previewAmount: previewSummary.totalAmount,
      });
    }
  }

  const report = buildPayrollReport(from, to, approvedRows);
  const pendingReport = buildPayrollReport(from, to, pendingRows);

  return {
    from,
    to,
    summary: {
      approvedAmount: report.grandTotal.amount,
      pendingAmount: pendingReport.grandTotal.amount,
      openShiftCount: shifts.filter((s) => s.status === "open").length,
      approvedShiftCount: approvedRows.length,
      closedShiftCount: pendingRows.length,
      minutes: {
        panel: report.grandTotal.panelMinutes,
        spot: report.grandTotal.spotMinutes,
        idle: report.grandTotal.idleMinutes,
        shift: report.grandTotal.shiftMinutes,
      },
    },
    actionQueue: actionQueue.sort((a, b) => {
      if (a.requiresSuperAdmin !== b.requiresSuperAdmin) {
        return a.requiresSuperAdmin ? -1 : 1;
      }
      return b.date.localeCompare(a.date);
    }),
    members: report.members,
    grandTotal: report.grandTotal,
    pendingGrandTotal: {
      amount: pendingReport.grandTotal.amount,
      shiftCount: pendingRows.length,
    },
  };
}
