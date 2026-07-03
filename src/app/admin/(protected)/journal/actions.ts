"use server";

import {
  AdminAccessError,
  getAdminContext,
} from "@/lib/admin-access";
import {
  queryAppointmentsList,
  queryCalendarDay,
  queryCalendarDayAppointments,
} from "@/lib/admin/calendar-day-data";
import {
  serializeAppointmentsList,
  serializeCalendarDay,
  type SerializedAppointment,
  type SerializedCalendarDay,
} from "@/lib/admin/calendar-day-serialize";

export type CalendarDayPayload = SerializedCalendarDay;

export async function loadCalendarDayAction(
  date: string,
  branchId?: string,
): Promise<
  { ok: true; data: CalendarDayPayload } | { ok: false; error: string }
> {
  try {
    const ctx = await getAdminContext();
    if (!ctx) {
      return { ok: false, error: "Сессия истекла. Войдите снова." };
    }
    const data = await queryCalendarDay(ctx, date, branchId || undefined);
    return { ok: true, data: serializeCalendarDay(data) };
  } catch (e) {
    if (e instanceof AdminAccessError) {
      if (e.message === "UNAUTHORIZED") {
        return { ok: false, error: "Сессия истекла. Войдите снова." };
      }
      return { ok: false, error: "Нет доступа к этому филиалу" };
    }
    return { ok: false, error: "Не удалось загрузить журнал" };
  }
}

export async function loadCalendarDayAppointmentsAction(
  date: string,
  branchId?: string,
): Promise<
  { ok: true; appointments: SerializedAppointment[] } | { ok: false; error: string }
> {
  try {
    const ctx = await getAdminContext();
    if (!ctx) {
      return { ok: false, error: "Сессия истекла. Войдите снова." };
    }
    const appointments = await queryCalendarDayAppointments(
      ctx,
      date,
      branchId || undefined,
    );
    return { ok: true, appointments: serializeAppointmentsList(appointments) };
  } catch (e) {
    if (e instanceof AdminAccessError) {
      if (e.message === "UNAUTHORIZED") {
        return { ok: false, error: "Сессия истекла. Войдите снова." };
      }
      return { ok: false, error: "Нет доступа к этому филиалу" };
    }
    return { ok: false, error: "Не удалось обновить записи" };
  }
}

export async function loadAppointmentsListAction(
  from: string,
  to: string,
  branchId?: string,
): Promise<
  { ok: true; appointments: SerializedAppointment[] } | { ok: false; error: string }
> {
  try {
    const ctx = await getAdminContext();
    if (!ctx) {
      return { ok: false, error: "Сессия истекла" };
    }
    const appointments = await queryAppointmentsList(
      ctx,
      from,
      to,
      branchId || undefined,
    );
    return { ok: true, appointments: serializeAppointmentsList(appointments) };
  } catch (e) {
    if (e instanceof AdminAccessError) {
      return { ok: false, error: "Нет доступа" };
    }
    return { ok: false, error: "Не удалось загрузить список" };
  }
}
