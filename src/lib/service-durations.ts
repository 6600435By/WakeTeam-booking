export const SERVICE_SLOT_DURATIONS = [10, 30, 60] as const;
export type ServiceSlotDuration = (typeof SERVICE_SLOT_DURATIONS)[number];

export function parseAllowedDurations(s: string): number[] {
  return s
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

export function bookingDurationOptions(slotMinutes: number): number[] {
  return SERVICE_SLOT_DURATIONS.filter(
    (d) => d >= slotMinutes && d % slotMinutes === 0,
  );
}

export function defaultAllowedDurationsForSlot(slotMinutes: number): string {
  return bookingDurationOptions(slotMinutes).join(",");
}

export function normalizeAllowedDurationsForSlot(
  current: string,
  slotMinutes: number,
): string {
  const options = new Set(bookingDurationOptions(slotMinutes));
  const kept = parseAllowedDurations(current).filter((d) => options.has(d));
  if (kept.length > 0) {
    return [...new Set(kept)].sort((a, b) => a - b).join(",");
  }
  return defaultAllowedDurationsForSlot(slotMinutes);
}

export function isServiceSlotDuration(
  value: number,
): value is ServiceSlotDuration {
  return (SERVICE_SLOT_DURATIONS as readonly number[]).includes(value);
}
