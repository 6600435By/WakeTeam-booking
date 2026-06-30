import { prisma } from "@/lib/db";
import { weekdayMinsk } from "@/lib/time";
import { timeToMinutes, minutesToTime } from "@/lib/calendar-grid";

export async function getBranchPlannedWindow(
  branchId: string,
  date: string,
): Promise<{ start: string | null; end: string | null }> {
  const weekday = weekdayMinsk(date);
  const reverses = await prisma.staff.findMany({
    where: { branchId, kind: "revers", isActive: true },
    include: { schedules: true },
  });
  let minStart: number | null = null;
  let maxEnd: number | null = null;
  for (const staff of reverses) {
    const rule = staff.schedules.find((s) => s.weekday === weekday && s.isWorking);
    if (!rule) continue;
    const from = timeToMinutes(rule.timeFrom);
    const to = timeToMinutes(rule.timeTo);
    if (minStart === null || from < minStart) minStart = from;
    if (maxEnd === null || to > maxEnd) maxEnd = to;
  }
  if (minStart === null || maxEnd === null) {
    return { start: null, end: null };
  }
  return {
    start: minutesToTime(minStart),
    end: minutesToTime(maxEnd),
  };
}
