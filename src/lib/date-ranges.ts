import { formatDateKey } from "./time";

export function todayDateKey(): string {
  return formatDateKey(new Date());
}

/** Один день — сегодня */
export function periodToday(): { from: string; to: string } {
  const to = todayDateKey();
  return { from: to, to };
}

/** 7 дней, включая сегодня */
export function periodWeek(): { from: string; to: string } {
  const to = todayDateKey();
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return { from: formatDateKey(d), to };
}

/** N календарных дней, включая сегодня (15 → сегодня минус 14 дня) */
export function periodLastDays(count: number): { from: string; to: string } {
  const to = todayDateKey();
  const d = new Date();
  d.setDate(d.getDate() - (count - 1));
  return { from: formatDateKey(d), to };
}

export function periodLast15Days(): { from: string; to: string } {
  return periodLastDays(15);
}
