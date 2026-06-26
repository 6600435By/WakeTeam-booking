import { adminFetch } from "@/lib/admin-fetch";
import { addMinutes } from "@/lib/time";

export type GroupApptRef = {
  id: string;
  startAt: string;
  durationMinutes: number;
  price?: number;
};

function distributeTotalPrice(total: number, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [Math.round(total * 100) / 100];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}

type CreateTemplate = {
  serviceId: string;
  staffId: string;
  phone: string;
  firstName: string;
  lastName?: string;
  comment?: string;
  status: string;
};

async function adminPatch(id: string, body: Record<string, unknown>) {
  const res = await adminFetch(`/api/admin/appointments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Ошибка сохранения",
    );
  }
}

async function adminDelete(id: string) {
  const res = await adminFetch(`/api/admin/appointments/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "admin" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Ошибка удаления",
    );
  }
}

async function adminCreate(
  body: Record<string, unknown>,
): Promise<GroupApptRef> {
  const res = await adminFetch("/api/admin/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Ошибка создания",
    );
  }
  const appt = data.appointment;
  return {
    id: appt.id,
    startAt: appt.startAt,
    durationMinutes: appt.durationMinutes,
  };
}

function sortGroup(group: GroupApptRef[]): GroupApptRef[] {
  return [...group].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export async function moveGroupAppointments(
  group: GroupApptRef[],
  isoStart: string,
  staffId: string,
): Promise<void> {
  const sorted = sortGroup(group);
  const delta =
    new Date(isoStart).getTime() - new Date(sorted[0].startAt).getTime();
  await Promise.all(
    sorted.map((appt) =>
      adminPatch(appt.id, {
        startAt: new Date(
          new Date(appt.startAt).getTime() + delta,
        ).toISOString(),
        staffId,
        durationMinutes: appt.durationMinutes,
      }),
    ),
  );
}

export async function deleteGroupAppointments(group: GroupApptRef[]): Promise<void> {
  await Promise.all(group.map((a) => adminDelete(a.id)));
}

function groupSpanMinutes(group: GroupApptRef[]): number {
  const sorted = sortGroup(group);
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0].durationMinutes;
  const start = new Date(sorted[0].startAt).getTime();
  const end = sorted.reduce((max, appt) => {
    const apptEnd =
      new Date(appt.startAt).getTime() + appt.durationMinutes * 60_000;
    return Math.max(max, apptEnd);
  }, start);
  return Math.round((end - start) / 60_000);
}

export async function resizeGroupAppointments(
  group: GroupApptRef[],
  newTotalDuration: number,
  createTemplate: CreateTemplate,
): Promise<GroupApptRef[]> {
  const sorted = sortGroup(group);
  const currentTotal = groupSpanMinutes(sorted);
  if (newTotalDuration === currentTotal) return sorted;

  if (sorted.length === 1) {
    await adminPatch(sorted[0].id, { durationMinutes: newTotalDuration });
    return [{ ...sorted[0], durationMinutes: newTotalDuration }];
  }

  const cell = sorted[0].durationMinutes;
  if (cell <= 0 || newTotalDuration % cell !== 0) {
    throw new Error(`Длительность должна быть кратна ${cell} мин`);
  }
  const targetCount = newTotalDuration / cell;
  if (targetCount < 1) {
    throw new Error("Длительность слишком короткая");
  }

  if (targetCount > sorted.length) {
    let nextStart = addMinutes(
      new Date(sorted[sorted.length - 1].startAt),
      sorted[sorted.length - 1].durationMinutes,
    );
    const added: GroupApptRef[] = [];
    for (let i = sorted.length; i < targetCount; i++) {
      const created = await adminCreate({
        ...createTemplate,
        startAt: nextStart.toISOString(),
        durationMinutes: cell,
      });
      added.push(created);
      nextStart = addMinutes(nextStart, cell);
    }
    return [...sorted, ...added];
  }

  const toRemove = sorted.slice(targetCount);
  await Promise.all(toRemove.map((a) => adminDelete(a.id)));
  return sorted.slice(0, targetCount);
}

export async function saveAppointmentEdit(params: {
  group: GroupApptRef[];
  isoStart: string;
  newStaffId: string;
  newServiceId: string;
  newDuration: number;
  totalPrice: number;
  firstName: string;
  lastName?: string;
  phone: string;
  status: string;
  comment?: string;
  membershipId?: string | null;
}): Promise<void> {
  const createTemplate: CreateTemplate = {
    serviceId: params.newServiceId,
    staffId: params.newStaffId,
    phone: params.phone,
    firstName: params.firstName,
    lastName: params.lastName,
    comment: params.comment,
    status: params.status,
  };

  if (params.group.length === 1) {
    await adminPatch(params.group[0].id, {
      startAt: params.isoStart,
      durationMinutes: params.newDuration,
      price: params.totalPrice,
      staffId: params.newStaffId,
      serviceId: params.newServiceId,
      firstName: params.firstName,
      lastName: params.lastName,
      phone: params.phone,
      status: params.status,
      comment: params.comment,
      membershipId: params.membershipId ?? null,
    });
    return;
  }

  let group = await resizeGroupAppointments(
    params.group,
    params.newDuration,
    createTemplate,
  );

  const oldFirst = new Date(group[0].startAt);
  const newFirst = new Date(params.isoStart);
  const deltaMs = newFirst.getTime() - oldFirst.getTime();
  const prices = distributeTotalPrice(params.totalPrice, group.length);

  await Promise.all(
    group.map((appt, i) =>
      adminPatch(appt.id, {
        startAt: new Date(new Date(appt.startAt).getTime() + deltaMs).toISOString(),
        staffId: params.newStaffId,
        serviceId: params.newServiceId,
        durationMinutes: appt.durationMinutes,
        price: prices[i],
        firstName: params.firstName,
        lastName: params.lastName,
        phone: params.phone,
        status: params.status,
        comment: params.comment,
        ...(i === 0 ? { membershipId: params.membershipId ?? null } : {}),
      }),
    ),
  );
}
