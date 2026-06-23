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
