import type { Appointment, ReverseAssignment } from "@prisma/client";
import { isUnfinishedAppointmentStatus } from "@/lib/appointment-status";
import {
  effectiveOperatorMemberId,
  type ReverseAssignmentWithShiftMember,
} from "./resolve-appointment-operator";
import {
  intersectInterval,
  mergeIntervals,
  totalMinutes,
  type TimeInterval,
} from "./interval-merge";

const COUNTED_STATUSES = new Set(["completed"]);
const IN_SERVICE_STATUS = "in_service";

type PanelAppointment = Pick<
  Appointment,
  "staffId" | "startAt" | "endAt" | "status" | "operatorMemberId"
>;

function collectPanelIntervals(
  shiftMemberId: string,
  shiftAssignments: ReverseAssignment[],
  appointments: PanelAppointment[],
  allDayAssignments: ReverseAssignmentWithShiftMember[],
  shiftStart: Date,
  shiftEnd: Date,
  statusFilter: (status: string) => boolean,
): number {
  const intervals: TimeInterval[] = [];
  const shiftWindow: TimeInterval = { start: shiftStart, end: shiftEnd };

  for (const appt of appointments) {
    if (!statusFilter(appt.status)) continue;

    const effectiveOperator = effectiveOperatorMemberId(
      {
        staffId: appt.staffId,
        startAt: new Date(appt.startAt),
        operatorMemberId: appt.operatorMemberId,
      },
      allDayAssignments,
    );
    if (effectiveOperator !== shiftMemberId) continue;

    const apptWindow: TimeInterval = {
      start: new Date(appt.startAt),
      end: new Date(appt.endAt),
    };
    const hitShift = intersectInterval(shiftWindow, apptWindow);
    if (!hitShift) continue;

    // Explicit operator pin credits the full appointment window as пульт
    // (auto-added panelOnly shifts have no ReverseAssignment yet).
    if (appt.operatorMemberId) {
      intervals.push(hitShift);
      continue;
    }

    for (const assignment of shiftAssignments) {
      if (assignment.staffId !== appt.staffId) continue;
      const assignWindow: TimeInterval = {
        start: assignment.startedAt,
        end: assignment.endedAt ?? shiftEnd,
      };
      const hit = intersectInterval(hitShift, assignWindow);
      if (hit) {
        intervals.push(hit);
        break;
      }
    }
  }

  return Math.round(totalMinutes(mergeIntervals(intervals)));
}

export function calcPanelMinutes(
  shiftMemberId: string,
  shiftAssignments: ReverseAssignment[],
  appointments: PanelAppointment[],
  allDayAssignments: ReverseAssignmentWithShiftMember[],
  shiftStart: Date,
  shiftEnd: Date,
): number {
  return collectPanelIntervals(
    shiftMemberId,
    shiftAssignments,
    appointments,
    allDayAssignments,
    shiftStart,
    shiftEnd,
    (status) => COUNTED_STATUSES.has(status),
  );
}

export function calcInServicePanelMinutes(
  shiftMemberId: string,
  shiftAssignments: ReverseAssignment[],
  appointments: PanelAppointment[],
  allDayAssignments: ReverseAssignmentWithShiftMember[],
  shiftStart: Date,
  shiftEnd: Date,
): number {
  return collectPanelIntervals(
    shiftMemberId,
    shiftAssignments,
    appointments,
    allDayAssignments,
    shiftStart,
    shiftEnd,
    (status) => status === IN_SERVICE_STATUS,
  );
}

export function countInServiceAppointments(
  appointments: Pick<Appointment, "status">[],
): number {
  return appointments.filter((a) => a.status === IN_SERVICE_STATUS).length;
}

export function countUnfinishedAppointments(
  appointments: Pick<Appointment, "status">[],
): number {
  return appointments.filter((a) => isUnfinishedAppointmentStatus(a.status)).length;
}
