"use server";

import {
  AdminAccessError,
  getAdminContext,
} from "@/lib/admin-access";
import {
  queryAppointmentsList,
  queryCalendarDay,
  queryCalendarDayAppointments,
  queryCalendarDayDelta,
} from "@/lib/admin/calendar-day-data";
import {
  serializeAppointmentsList,
  serializeCalendarDay,
  serializeCalendarDayDelta,
  type SerializedAppointment,
  type SerializedCalendarDay,
  type SerializedCalendarDayDelta,
} from "@/lib/admin/calendar-day-serialize";

export type CalendarDayPayload = SerializedCalendarDay;
export type CalendarDayDeltaPayload = SerializedCalendarDayDelta;

function mapJournalActionError(e: unknown, fallback: string): string {
  if (e instanceof AdminAccessError) {
    if (e.message === "UNAUTHORIZED") {
      return "Сессия истекла. Войдите снова.";
    }
    return "Нет доступа к этому филиалу";
  }
  return fallback;
}

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
    if ((ctx.isSuperAdmin || ctx.isBranchManager) && !branchId) {
      return { ok: false, error: "Выберите филиал" };
    }
    const data = await queryCalendarDay(ctx, date, branchId || undefined);
    return { ok: true, data: serializeCalendarDay(data) };
  } catch (e) {
    return { ok: false, error: mapJournalActionError(e, "Не удалось загрузить журнал") };
  }
}

/** Date change within the same branch — skip branches/services refetch. */
export async function loadCalendarDayDeltaAction(
  date: string,
  branchId?: string,
): Promise<
  { ok: true; data: CalendarDayDeltaPayload } | { ok: false; error: string }
> {
  try {
    const ctx = await getAdminContext();
    if (!ctx) {
      return { ok: false, error: "Сессия истекла. Войдите снова." };
    }
    if ((ctx.isSuperAdmin || ctx.isBranchManager) && !branchId) {
      return { ok: false, error: "Выберите филиал" };
    }
    const data = await queryCalendarDayDelta(ctx, date, branchId || undefined);
    return { ok: true, data: serializeCalendarDayDelta(data) };
  } catch (e) {
    return { ok: false, error: mapJournalActionError(e, "Не удалось обновить день") };
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
    if ((ctx.isSuperAdmin || ctx.isBranchManager) && !branchId) {
      return { ok: false, error: "Выберите филиал" };
    }
    const appointments = await queryCalendarDayAppointments(
      ctx,
      date,
      branchId || undefined,
    );
    return { ok: true, appointments: serializeAppointmentsList(appointments) };
  } catch (e) {
    return { ok: false, error: mapJournalActionError(e, "Не удалось обновить записи") };
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
