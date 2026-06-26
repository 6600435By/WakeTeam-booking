/** Короткое имя ресурса только для UI журнала записей. */
export function journalStaffDisplayName(name: string): string {
  const supMatch = name.match(/^Сапборд\s*№?\s*(\d+)/i);
  if (supMatch) return `Сап ${supMatch[1]}`;
  return name;
}
