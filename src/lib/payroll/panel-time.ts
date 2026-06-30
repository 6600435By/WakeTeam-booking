import type { Appointment, ReverseAssignment } from "@prisma/client";
import {
  intersectInterval,
  mergeIntervals,
  totalMinutes,
  type TimeInterval,
} from "./interval-merge";

const EXCLUDED_STATUSES = new Set(["cancelled", "no_show", "canceled"]);

export function calcPanelMinutes(
  assignments: ReverseAssignment[],
  appointments: Pick<Appointment, "staffId" | "startAt" | "endAt" | "status">[],
  shiftStart: Date,
  shiftEnd: Date,
): number {
  const intervals: TimeInterval[] = [];
  const shiftWindow: TimeInterval = { start: shiftStart, end: shiftEnd };

  for (const assignment of assignments) {
    const assignStart = assignment.startedAt;
    const assignEnd = assignment.endedAt ?? shiftEnd;
    const assignWindow: TimeInterval = { start: assignStart, end: assignEnd };
    const window = intersectInterval(shiftWindow, assignWindow);
    if (!window) continue;

    for (const appt of appointments) {
      if (appt.staffId !== assignment.staffId) continue;
      if (EXCLUDED_STATUSES.has(appt.status)) continue;
      const apptWindow: TimeInterval = {
        start: new Date(appt.startAt),
        end: new Date(appt.endAt),
      };
      const hit = intersectInterval(window, apptWindow);
      if (hit) intervals.push(hit);
    }
  }

  return Math.round(totalMinutes(intervals));
}
