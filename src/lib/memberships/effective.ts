export function effectiveRemainingMinutes(
  sheetRemainingMinutes: number,
  localDeductedMinutes: number,
): number {
  return Math.max(0, sheetRemainingMinutes - localDeductedMinutes);
}

export type MembershipWithEffective = {
  id: string;
  externalCode: string;
  category: string | null;
  ownerName: string | null;
  phone: string;
  initialMinutes: number;
  sheetRemainingMinutes: number;
  localDeductedMinutes: number;
  effectiveRemainingMinutes: number;
  comment: string | null;
  saleDate: Date | null;
  syncedAt: Date;
};

export function toMembershipDto(m: {
  id: string;
  externalCode: string;
  category: string | null;
  ownerName: string | null;
  phone: string;
  initialMinutes: number;
  sheetRemainingMinutes: number;
  localDeductedMinutes: number;
  comment: string | null;
  saleDate: Date | null;
  syncedAt: Date;
}): MembershipWithEffective {
  return {
    ...m,
    effectiveRemainingMinutes: effectiveRemainingMinutes(
      m.sheetRemainingMinutes,
      m.localDeductedMinutes,
    ),
  };
}
