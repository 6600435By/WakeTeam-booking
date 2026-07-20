import type {
  queryCalendarDay,
  queryCalendarDayDelta,
  queryAppointmentsList,
} from "@/lib/admin/calendar-day-data";

type CalendarDayRaw = Awaited<ReturnType<typeof queryCalendarDay>>;
type CalendarDayDeltaRaw = Awaited<ReturnType<typeof queryCalendarDayDelta>>;
type AppointmentRaw = CalendarDayRaw["appointments"][number];
type AppointmentsListRaw = Awaited<ReturnType<typeof queryAppointmentsList>>;

export type SerializedAppointment = Omit<AppointmentRaw, "startAt" | "endAt"> & {
  startAt: string;
  endAt: string;
};

export type SerializedCalendarDay = Omit<CalendarDayRaw, "appointments"> & {
  appointments: SerializedAppointment[];
};

export type SerializedCalendarDayDelta = Omit<CalendarDayDeltaRaw, "appointments"> & {
  appointments: SerializedAppointment[];
};

function serializeAppointment(a: AppointmentRaw): SerializedAppointment {
  return {
    ...a,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
  };
}

export function serializeCalendarDay(data: CalendarDayRaw): SerializedCalendarDay {
  return {
    ...data,
    appointments: data.appointments.map(serializeAppointment),
  };
}

export function serializeCalendarDayDelta(
  data: CalendarDayDeltaRaw,
): SerializedCalendarDayDelta {
  return {
    ...data,
    appointments: data.appointments.map(serializeAppointment),
  };
}

export function serializeAppointmentsList(
  appointments: AppointmentsListRaw,
): SerializedAppointment[] {
  return appointments.map(serializeAppointment);
}
