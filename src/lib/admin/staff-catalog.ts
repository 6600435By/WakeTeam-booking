/** Ресурсы с окном в названии — старая схема «ресурс × смена». */
export function isLegacyTimeSlotStaffName(name: string) {
  return /\(\s*\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}\s*\)/.test(name);
}

export function isLegacyTimeSlotStaff(staff: { name: string }) {
  return isLegacyTimeSlotStaffName(staff.name);
}

export function catalogStaff<T extends { name: string }>(staff: T[]): T[] {
  return staff.filter((s) => !isLegacyTimeSlotStaff(s));
}

export function catalogStaffByKind<T extends { name: string; kind: string }>(
  staff: T[],
  kind: "revers" | "sup",
): T[] {
  return catalogStaff(staff).filter((s) => s.kind === kind);
}
