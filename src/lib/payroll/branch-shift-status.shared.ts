export type BranchOpenShift = {
  shiftId: string;
  memberId: string;
  memberName: string;
  actualStart: string | null;
  workAsAdmin: boolean;
};

export type BranchShiftStatus = {
  branchId: string;
  date: string;
  isOpen: boolean;
  openCount: number;
  openShifts: BranchOpenShift[];
  scheduledCount: number;
};

export function formatBranchOpenLabel(status: BranchShiftStatus): string {
  if (!status.isOpen) return "";
  const names = status.openShifts.map((s) => s.memberName);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} и ${names[1]}`;
  return `${names[0]} и ещё ${names.length - 1}`;
}
