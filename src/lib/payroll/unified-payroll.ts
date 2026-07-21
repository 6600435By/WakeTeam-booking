import type { ShiftSummary } from "./shift-summary";

export type UnifiedShiftRow = {
  shiftId: string;
  date: string;
  status: string;
  memberId: string;
  panelMinutes: number;
  spotMinutes: number;
  idleMinutes: number;
  shiftMinutes: number;
  totalAmount: number;
  isPreview: boolean;
  flags: {
    employeeSubmitted: boolean;
    requiresSuperAdmin: boolean;
    panelOnly: boolean;
    unconfirmedSpotMinutes: number;
    needsAction: boolean;
  };
  actualStart: string | null;
  actualEnd: string | null;
  isOperator: boolean;
  lines: ShiftSummary["lines"];
};

export type UnifiedMemberBlock = {
  memberId: string;
  memberName: string;
  branchName: string | null;
  role: string;
  totals: {
    approvedAmount: number;
    pendingAmount: number;
    openCount: number;
    shiftCount: number;
    needsActionCount: number;
  };
  shifts: UnifiedShiftRow[];
};

export type UnifiedShiftInput = {
  shiftId: string;
  date: string;
  status: string;
  memberId: string;
  memberName: string;
  branchName: string | null;
  role: string;
  panelOnly: boolean;
  employeeSubmittedAt: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  previewSummary: ShiftSummary;
  payrollSummary: ShiftSummary;
  canReview: boolean;
  requiresSuperAdmin: boolean;
};

function shiftNeedsAction(
  input: UnifiedShiftInput,
  periodTo: string,
): boolean {
  if (!input.canReview) return false;
  if (input.status === "open") {
    return input.date <= periodTo;
  }
  if (input.status === "closed") return true;
  return false;
}

export function buildUnifiedMemberBlocks(
  items: UnifiedShiftInput[],
  periodTo: string,
): UnifiedMemberBlock[] {
  const byMember = new Map<string, UnifiedMemberBlock>();

  for (const item of items) {
    const isApproved = item.status === "approved";
    const isClosed = item.status === "closed";
    const isOpen = item.status === "open";
    const summary = isApproved ? item.payrollSummary : item.previewSummary;
    const amount = summary.totalAmount;
    const needsAction = shiftNeedsAction(item, periodTo);

    const row: UnifiedShiftRow = {
      shiftId: item.shiftId,
      date: item.date,
      status: item.status,
      memberId: item.memberId,
      panelMinutes: summary.panelMinutes,
      spotMinutes: summary.spotMinutes,
      idleMinutes: summary.idleMinutes,
      shiftMinutes: summary.shiftMinutes,
      totalAmount: amount,
      isPreview: !isApproved,
      flags: {
        employeeSubmitted: Boolean(item.employeeSubmittedAt),
        requiresSuperAdmin: item.requiresSuperAdmin,
        panelOnly: item.panelOnly,
        unconfirmedSpotMinutes: item.previewSummary.unconfirmedSpotMinutes ?? 0,
        needsAction,
      },
      actualStart: item.actualStart?.toISOString() ?? null,
      actualEnd: item.actualEnd?.toISOString() ?? null,
      isOperator: summary.isOperator,
      lines: summary.lines,
    };

    let block = byMember.get(item.memberId);
    if (!block) {
      block = {
        memberId: item.memberId,
        memberName: item.memberName,
        branchName: item.branchName,
        role: item.role,
        totals: {
          approvedAmount: 0,
          pendingAmount: 0,
          openCount: 0,
          shiftCount: 0,
          needsActionCount: 0,
        },
        shifts: [],
      };
      byMember.set(item.memberId, block);
    }

    block.shifts.push(row);
    block.totals.shiftCount += 1;
    if (isApproved) block.totals.approvedAmount += amount;
    else if (isClosed) block.totals.pendingAmount += amount;
    else if (isOpen) {
      block.totals.openCount += 1;
      block.totals.pendingAmount += amount;
    }
    if (needsAction) block.totals.needsActionCount += 1;
  }

  const members = [...byMember.values()].map((block) => ({
    ...block,
    shifts: block.shifts.sort((a, b) => b.date.localeCompare(a.date)),
  }));

  members.sort((a, b) => {
    if (a.totals.needsActionCount !== b.totals.needsActionCount) {
      return b.totals.needsActionCount - a.totals.needsActionCount;
    }
    const aTotal = a.totals.approvedAmount + a.totals.pendingAmount;
    const bTotal = b.totals.approvedAmount + b.totals.pendingAmount;
    return bTotal - aTotal;
  });

  return members;
}

export function unifiedShiftStatusLabel(
  row: UnifiedShiftRow,
  periodTo: string,
): string {
  if (row.flags.panelOnly && row.status === "open") return "Только пульт";
  if (row.status === "approved") return "Утверждена";
  if (row.status === "open") {
    return row.date < periodTo ? "Не закрыта" : "Идёт";
  }
  if (row.status === "closed") {
    if (!row.flags.employeeSubmitted) return "Ждёт сотрудника";
    return "На проверке";
  }
  return row.status;
}
