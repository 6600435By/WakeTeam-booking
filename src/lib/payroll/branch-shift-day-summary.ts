import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import {
  computeShiftSummary,
  resolveEffectiveShiftEnd,
  SHIFT_INCLUDE,
} from "./work-shift-service";
import { computeBranchShiftSales, type BranchShiftSales } from "./shift-branch-sales";

export type BranchDayStaffRow = {
  shiftId: string;
  memberId: string;
  memberName: string;
  role: string;
  status: string;
  panelMinutes: number;
  spotMinutes: number;
  idleMinutes: number;
  shiftMinutes: number;
  totalAmount: number;
};

export type BranchShiftDaySummary = {
  staffOnShift: BranchDayStaffRow[];
  totals: {
    panelMinutes: number;
    spotMinutes: number;
    idleMinutes: number;
    shiftMinutes: number;
    totalAmount: number;
  };
  sales: BranchShiftSales;
};

export async function computeBranchShiftDaySummary(
  branchId: string,
  date: string,
  salesWindow: { start: Date; end: Date },
  now = new Date(),
): Promise<BranchShiftDaySummary> {
  const shifts = await prisma.workShift.findMany({
    where: {
      branchId,
      date,
      status: { in: ["open", "closed", "approved"] },
      actualStart: { not: null },
    },
    include: SHIFT_INCLUDE,
    orderBy: { actualStart: "asc" },
  });

  const staffOnShift: BranchDayStaffRow[] = [];
  const totals = {
    panelMinutes: 0,
    spotMinutes: 0,
    idleMinutes: 0,
    shiftMinutes: 0,
    totalAmount: 0,
  };

  for (const shift of shifts) {
    const summary = await computeShiftSummary(shift, now);
    const row: BranchDayStaffRow = {
      shiftId: shift.id,
      memberId: shift.memberId,
      memberName: staffDisplayName(shift.member.user),
      role: shift.member.role,
      status: shift.status,
      panelMinutes: summary.panelMinutes,
      spotMinutes: summary.spotMinutes,
      idleMinutes: summary.idleMinutes,
      shiftMinutes: summary.shiftMinutes,
      totalAmount: summary.totalAmount,
    };
    staffOnShift.push(row);
    totals.panelMinutes += summary.panelMinutes;
    totals.spotMinutes += summary.spotMinutes;
    totals.idleMinutes += summary.idleMinutes;
    totals.shiftMinutes += summary.shiftMinutes;
    totals.totalAmount += summary.totalAmount;
  }

  const sales = await computeBranchShiftSales(
    branchId,
    salesWindow.start,
    salesWindow.end,
  );

  return { staffOnShift, totals, sales };
}

export function shiftSalesWindow(
  shift: {
    actualStart: Date | null;
    actualEnd: Date | null;
    status: string;
    date: string;
    plannedEnd: string | null;
  },
  now = new Date(),
): { start: Date; end: Date } | null {
  if (!shift.actualStart) return null;
  const end = resolveEffectiveShiftEnd(shift, now);
  if (!end) return null;
  return { start: shift.actualStart, end };
}
