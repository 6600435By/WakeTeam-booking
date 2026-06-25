/** Админ: любая длительность кратная 5 минутам (минимум 5). */
export function normalizeAdminDuration(minutes: number): number {
  const n = Math.round(minutes);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.max(5, Math.round(n / 5) * 5);
}
