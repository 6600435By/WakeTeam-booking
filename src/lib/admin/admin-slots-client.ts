import { adminFetch } from "@/lib/admin-fetch";

export type AdminWakeSlot = {
  startAt: string;
  endAt: string;
  staffId: string;
  staffName: string;
  status: "free" | "busy";
};

export type AdminSupSlot = {
  startAt: string;
  endAt: string;
  status: "free" | "busy";
  availableBoards: number;
};

export type AdminSlotsResponse =
  | { kind: "wake"; slots: AdminWakeSlot[]; allowedDurations: number[] }
  | { kind: "sup"; slots: AdminSupSlot[]; allowedDurations: number[] };

export async function fetchAdminSlots(params: {
  serviceId: string;
  date: string;
  staffId?: string;
  durationMinutes?: number;
  excludeAppointmentId?: string;
}): Promise<AdminSlotsResponse> {
  const q = new URLSearchParams({
    serviceId: params.serviceId,
    date: params.date,
  });
  if (params.staffId) q.set("staffId", params.staffId);
  if (params.durationMinutes) {
    q.set("durationMinutes", String(params.durationMinutes));
  }
  if (params.excludeAppointmentId) {
    q.set("excludeAppointmentId", params.excludeAppointmentId);
  }

  const res = await adminFetch(`/api/admin/slots?${q}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Не удалось загрузить слоты");
  }
  return data as AdminSlotsResponse;
}

export function formatAdminSlotTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Minsk",
  });
}
