import type { queryCalendarDay, queryAppointmentsList } from "@/lib/admin/calendar-day-data";

type CalendarDayRaw = Awaited<ReturnType<typeof queryCalendarDay>>;
type AppointmentRaw = CalendarDayRaw["appointments"][number];
type AppointmentsListRaw = Awaited<ReturnType<typeof queryAppointmentsList>>;

export type SerializedAppointment = Omit<AppointmentRaw, "startAt" | "endAt"> & {
  startAt: string;
  endAt: string;
};

export type SerializedCalendarDay = Omit<CalendarDayRaw, "appointments"> & {
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

export function serializeAppointmentsList(
  appointments: AppointmentsListRaw,
): SerializedAppointment[] {
  return appointments.map(serializeAppointment);
}
