import type { ShiftSummary } from "./shift-summary";
import { formatMoney } from "./shift-summary";

export type PeriodShiftRow = {
  shiftId: string;
  date: string;
  status: string;
  totalAmount: number;
  panelMinutes: number;
  spotMinutes: number;
  idleMinutes: number;
  shiftMinutes: number;
};

export type PeriodReport = {
  from: string;
  to: string;
  shifts: PeriodShiftRow[];
  totals: {
    shiftMinutes: number;
    panelMinutes: number;
    spotMinutes: number;
    idleMinutes: number;
    amount: number;
  };
};

export function aggregatePeriodReport(
  from: string,
  to: string,
  rows: PeriodShiftRow[],
): PeriodReport {
  const totals = rows.reduce(
    (acc, r) => ({
      shiftMinutes: acc.shiftMinutes + r.shiftMinutes,
      panelMinutes: acc.panelMinutes + r.panelMinutes,
      spotMinutes: acc.spotMinutes + r.spotMinutes,
      idleMinutes: acc.idleMinutes + r.idleMinutes,
      amount: acc.amount + r.totalAmount,
    }),
    { shiftMinutes: 0, panelMinutes: 0, spotMinutes: 0, idleMinutes: 0, amount: 0 },
  );
  return { from, to, shifts: rows, totals };
}

export function summaryToPeriodRow(
  shiftId: string,
  date: string,
  status: string,
  summary: ShiftSummary,
): PeriodShiftRow {
  return {
    shiftId,
    date,
    status,
    totalAmount: summary.totalAmount,
    panelMinutes: summary.panelMinutes,
    spotMinutes: summary.spotMinutes,
    idleMinutes: summary.idleMinutes,
    shiftMinutes: summary.shiftMinutes,
  };
}

export { formatMoney };
