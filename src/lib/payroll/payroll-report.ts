import type { ShiftSummary } from "./shift-summary";
import type { PeriodShiftRow } from "./period-report";

export type PayrollShiftRow = PeriodShiftRow & {
  memberId: string;
  memberName: string;
  branchId: string;
  branchName: string | null;
  role: string;
  actualStart: string | null;
  actualEnd: string | null;
  lines: ShiftSummary["lines"];
  isOperator: boolean;
};

export type MemberPayrollBlock = {
  memberId: string;
  memberName: string;
  branchId: string | null;
  branchName: string | null;
  role: string;
  shifts: PayrollShiftRow[];
  totals: {
    shiftMinutes: number;
    panelMinutes: number;
    spotMinutes: number;
    idleMinutes: number;
    amount: number;
    shiftCount: number;
  };
};

export type PayrollReport = {
  from: string;
  to: string;
  members: MemberPayrollBlock[];
  grandTotal: {
    shiftMinutes: number;
    panelMinutes: number;
    spotMinutes: number;
    idleMinutes: number;
    amount: number;
    shiftCount: number;
  };
};

export function buildPayrollReport(
  from: string,
  to: string,
  rows: PayrollShiftRow[],
): PayrollReport {
  const byMember = new Map<string, PayrollShiftRow[]>();
  for (const row of rows) {
    const list = byMember.get(row.memberId) ?? [];
    list.push(row);
    byMember.set(row.memberId, list);
  }

  const members: MemberPayrollBlock[] = [...byMember.entries()].map(
    ([memberId, shifts]) => {
      const first = shifts[0]!;
      const totals = shifts.reduce(
        (acc, s) => ({
          shiftMinutes: acc.shiftMinutes + s.shiftMinutes,
          panelMinutes: acc.panelMinutes + s.panelMinutes,
          spotMinutes: acc.spotMinutes + s.spotMinutes,
          idleMinutes: acc.idleMinutes + s.idleMinutes,
          amount: acc.amount + s.totalAmount,
          shiftCount: acc.shiftCount + 1,
        }),
        {
          shiftMinutes: 0,
          panelMinutes: 0,
          spotMinutes: 0,
          idleMinutes: 0,
          amount: 0,
          shiftCount: 0,
        },
      );
      return {
        memberId,
        memberName: first.memberName,
        branchId: first.branchId,
        branchName: first.branchName,
        role: first.role,
        shifts: shifts.sort((a, b) => a.date.localeCompare(b.date)),
        totals,
      };
    },
  );

  members.sort((a, b) => a.memberName.localeCompare(b.memberName, "ru"));

  const grandTotal = members.reduce(
    (acc, m) => ({
      shiftMinutes: acc.shiftMinutes + m.totals.shiftMinutes,
      panelMinutes: acc.panelMinutes + m.totals.panelMinutes,
      spotMinutes: acc.spotMinutes + m.totals.spotMinutes,
      idleMinutes: acc.idleMinutes + m.totals.idleMinutes,
      amount: acc.amount + m.totals.amount,
      shiftCount: acc.shiftCount + m.totals.shiftCount,
    }),
    {
      shiftMinutes: 0,
      panelMinutes: 0,
      spotMinutes: 0,
      idleMinutes: 0,
      amount: 0,
      shiftCount: 0,
    },
  );

  return { from, to, members, grandTotal };
}
