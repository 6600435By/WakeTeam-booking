import { parseTimeOnDate, TZ } from "@/lib/time";
import { formatInTimeZone } from "date-fns-tz";

export const JOURNAL_GRID_STEPS = [5, 10, 15] as const;
export type JournalGridStep = (typeof JOURNAL_GRID_STEPS)[number];
export const DEFAULT_GRID_SLOT_MINUTES: JournalGridStep = 15;
export const SLOT_HEIGHT_PX = 34;

/** @deprecated use DEFAULT_GRID_SLOT_MINUTES */
export const GRID_SLOT_MINUTES = DEFAULT_GRID_SLOT_MINUTES;

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isoAtMinutes(dateStr: string, minutes: number): string {
  return parseTimeOnDate(dateStr, minutesToTime(minutes)).toISOString();
}

export function minutesFromIso(dateStr: string, iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const apptDate = formatInTimeZone(d, TZ, "yyyy-MM-dd");
  if (apptDate !== dateStr) return null;
  const t = formatInTimeZone(d, TZ, "HH:mm");
  const minutes = timeToMinutes(t);
  return Number.isFinite(minutes) ? minutes : null;
}

export function getAppointmentLayout(
  dateStr: string,
  bounds: { start: number; end: number },
  startAt: string,
  endAt: string,
  slotMinutes: number = DEFAULT_GRID_SLOT_MINUTES,
  slotHeightPx: number = SLOT_HEIGHT_PX,
): { top: number; height: number } | null {
  const topMin = minutesFromIso(dateStr, startAt);
  const endMin = minutesFromIso(dateStr, endAt);
  if (topMin === null || endMin === null || endMin <= topMin) return null;

  const top =
    ((topMin - bounds.start) / slotMinutes) * slotHeightPx;
  const height = Math.max(
    ((endMin - topMin) / slotMinutes) * slotHeightPx,
    slotHeightPx,
  );
  if (!Number.isFinite(top) || !Number.isFinite(height)) return null;
  return { top, height };
}

type Schedule = {
  weekday: number;
  isWorking: boolean;
  timeFrom: string;
  timeTo: string;
};

export function getStaffRule(
  schedules: Schedule[],
  weekday: number,
): Schedule | undefined {
  return schedules.find(
    (s) => Number(s.weekday) === weekday && s.isWorking,
  );
}

export function isStaffWorkingAt(
  schedules: Schedule[],
  weekday: number,
  minutes: number,
): boolean {
  const rule = getStaffRule(schedules, weekday);
  if (!rule) return false;
  const from = timeToMinutes(rule.timeFrom);
  const to = timeToMinutes(rule.timeTo);
  return minutes >= from && minutes < to;
}

export function getGridBounds(
  staffList: { schedules: Schedule[] }[],
  weekday: number,
  appointments: { startAt: string; endAt: string }[] = [],
  dateStr?: string,
  slotMinutes: number = DEFAULT_GRID_SLOT_MINUTES,
): { start: number; end: number } {
  let start = 24 * 60;
  let end = 0;
  for (const s of staffList) {
    const rule = getStaffRule(s.schedules, weekday);
    if (!rule) continue;
    const from = timeToMinutes(rule.timeFrom);
    const to = timeToMinutes(rule.timeTo);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) continue;
    start = Math.min(start, from);
    end = Math.max(end, to);
  }

  if (dateStr) {
    for (const a of appointments) {
      const topMin = minutesFromIso(dateStr, a.startAt);
      const endMin = minutesFromIso(dateStr, a.endAt);
      if (topMin === null || endMin === null) continue;
      start = Math.min(start, topMin);
      end = Math.max(end, endMin);
    }
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return { start: 9 * 60, end: 21 * 60 };
  }

  start = Math.floor(start / slotMinutes) * slotMinutes;
  end = Math.ceil(end / slotMinutes) * slotMinutes;
  return { start, end };
}

export function generateTimeLabels(
  start: number,
  end: number,
  slotMinutes: number = DEFAULT_GRID_SLOT_MINUTES,
): number[] {
  const labels: number[] = [];
  for (let m = start; m < end; m += slotMinutes) {
    labels.push(m);
  }
  return labels;
}

export function formatMinutesLabel(
  minutes: number,
  slotMinutes: number = DEFAULT_GRID_SLOT_MINUTES,
): string {
  const labelEvery =
    slotMinutes <= 5 ? 15 : slotMinutes <= 10 ? 30 : 60;
  if (minutes % labelEvery !== 0) return "";
  return minutesToTime(minutes);
}

export type MinuteInterval = { start: number; end: number };

export function getOverlapRegions(
  dateStr: string,
  appointments: { startAt: string; endAt: string }[],
): MinuteInterval[] {
  type Event = { t: number; delta: number };
  const events: Event[] = [];

  for (const a of appointments) {
    const start = minutesFromIso(dateStr, a.startAt);
    const end = minutesFromIso(dateStr, a.endAt);
    if (start === null || end === null || end <= start) continue;
    events.push({ t: start, delta: 1 }, { t: end, delta: -1 });
  }

  events.sort((a, b) => a.t - b.t || a.delta - b.delta);

  let count = 0;
  let overlapStart: number | null = null;
  const regions: MinuteInterval[] = [];

  for (const e of events) {
    const prev = count;
    count += e.delta;
    if (prev < 2 && count >= 2) {
      overlapStart = e.t;
    } else if (prev >= 2 && count < 2 && overlapStart !== null) {
      regions.push({ start: overlapStart, end: e.t });
      overlapStart = null;
    }
  }

  return regions;
}

export function getAppointmentOverlapSegments(
  dateStr: string,
  startAt: string,
  endAt: string,
  others: { startAt: string; endAt: string }[],
): MinuteInterval[] {
  const myStart = minutesFromIso(dateStr, startAt);
  const myEnd = minutesFromIso(dateStr, endAt);
  if (myStart === null || myEnd === null || myEnd <= myStart) return [];

  const segments: MinuteInterval[] = [];
  for (const other of others) {
    const oStart = minutesFromIso(dateStr, other.startAt);
    const oEnd = minutesFromIso(dateStr, other.endAt);
    if (oStart === null || oEnd === null) continue;
    const start = Math.max(myStart, oStart);
    const end = Math.min(myEnd, oEnd);
    if (start < end) segments.push({ start, end });
  }

  if (!segments.length) return [];
  segments.sort((a, b) => a.start - b.start);
  const merged: MinuteInterval[] = [{ ...segments[0] }];
  for (let i = 1; i < segments.length; i++) {
    const last = merged[merged.length - 1];
    if (segments[i].start <= last.end) {
      last.end = Math.max(last.end, segments[i].end);
    } else {
      merged.push({ ...segments[i] });
    }
  }
  return merged;
}

export type ConsecutiveAppointmentGroup<
  T extends {
    id: string;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    status: string;
    client: { phone: string };
  },
> = {
  id: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  appointments: T[];
};

function spanDurationMinutes(startAt: string, endAt: string): number {
  return Math.round(
    (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000,
  );
}

function appointmentsConsecutive(
  prev: { endAt: string },
  next: { startAt: string },
): boolean {
  return new Date(prev.endAt).getTime() === new Date(next.startAt).getTime();
}

function touchesOrOverlaps(
  prev: { endAt: string },
  next: { startAt: string },
): boolean {
  return new Date(next.startAt).getTime() < new Date(prev.endAt).getTime();
}

function mergeAppointmentIntoGroup<
  T extends {
    id: string;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    status: string;
    client: { phone: string };
  },
>(current: ConsecutiveAppointmentGroup<T>, appt: T) {
  current.appointments.push(appt);
  if (new Date(appt.endAt).getTime() > new Date(current.endAt).getTime()) {
    current.endAt = appt.endAt;
  }
  current.durationMinutes = spanDurationMinutes(current.startAt, current.endAt);
}

/** Объединяет подряд идущие и пересекающиеся записи одного клиента в один блок. */
export function groupConsecutiveClientAppointments<
  T extends {
    id: string;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    status: string;
    client: { phone: string };
  },
>(appointments: T[]): ConsecutiveAppointmentGroup<T>[] {
  if (!appointments.length) return [];

  const sorted = [...appointments].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );

  const groups: ConsecutiveAppointmentGroup<T>[] = [];
  let current: ConsecutiveAppointmentGroup<T> | null = null;

  for (const appt of sorted) {
    const last = current?.appointments[current.appointments.length - 1];
    const sameClientGroup =
      current &&
      current.appointments[0].status === appt.status &&
      current.appointments[0].client.phone === appt.client.phone;

    if (
      sameClientGroup &&
      last &&
      (appointmentsConsecutive(last, appt) || touchesOrOverlaps(last, appt))
    ) {
      mergeAppointmentIntoGroup(current!, appt);
    } else {
      current = {
        id: appt.id,
        startAt: appt.startAt,
        endAt: appt.endAt,
        durationMinutes: appt.durationMinutes,
        appointments: [appt],
      };
      groups.push(current);
    }
  }

  return groups;
}
