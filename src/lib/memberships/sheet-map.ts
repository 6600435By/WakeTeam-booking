/** Google Sheet column letters → field names (0-based index). */
export const MEMBERSHIP_SHEET_COLUMNS = {
  saleDate: 0, // A
  externalCode: 1, // B
  category: 2, // C
  initialMinutes: 3, // D
  pricePerMinute: 4, // E — стоимость мин.
  ownerName: 9, // J
  phone: 10, // K
  sheetRemainingMinutes: 12, // M
  comment: 13, // N
} as const;

export type MembershipSheetRow = {
  saleDate: string;
  externalCode: string;
  category: string;
  initialMinutes: string;
  pricePerMinute: string;
  ownerName: string;
  phone: string;
  sheetRemainingMinutes: string;
  comment: string;
};

export function rowToMembershipFields(cells: string[]): MembershipSheetRow | null {
  const c = MEMBERSHIP_SHEET_COLUMNS;
  const externalCode = (cells[c.externalCode] ?? "").trim();
  if (!externalCode) return null;
  return {
    saleDate: (cells[c.saleDate] ?? "").trim(),
    externalCode,
    category: (cells[c.category] ?? "").trim(),
    initialMinutes: (cells[c.initialMinutes] ?? "").trim(),
    pricePerMinute: (cells[c.pricePerMinute] ?? "").trim(),
    ownerName: (cells[c.ownerName] ?? "").trim(),
    phone: (cells[c.phone] ?? "").trim(),
    sheetRemainingMinutes: (cells[c.sheetRemainingMinutes] ?? "").trim(),
    comment: (cells[c.comment] ?? "").trim(),
  };
}
