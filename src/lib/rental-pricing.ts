import { formatDateKey, parseTimeOnDate } from "@/lib/time";
import type { DbClient } from "@/lib/db-types";

export type RentalItemDto = {
  id: string;
  name: string;
  price: number;
};

export const DEFAULT_BRANCH_RENTAL_ITEMS = [
  { name: "Полный комплект", price: 30, sortOrder: 0 },
  { name: "Доска", price: 15, sortOrder: 1 },
  { name: "Гидрокостюм", price: 10, sortOrder: 2 },
] as const;

export function rentalLineTotal(price: number, quantity: number): number {
  if (quantity <= 0) return 0;
  return Math.round(price * quantity * 100) / 100;
}

export function dayBounds(dateKey: string) {
  const dayStart = parseTimeOnDate(dateKey, "00:00");
  const toDate = parseTimeOnDate(dateKey, "12:00");
  toDate.setDate(toDate.getDate() + 1);
  const nextKey = formatDateKey(toDate);
  const dayEnd = parseTimeOnDate(nextKey, "00:00");
  return { dayStart, dayEnd };
}

type RentalAppointmentRow = {
  id: string;
  startAt: Date;
  rentalItemId: string | null;
  rentalQuantity: number;
  rentalAmount: number;
  price: number;
};

export function pickRentalChargeAppointmentId(
  appointments: Pick<RentalAppointmentRow, "id" | "startAt" | "rentalItemId">[],
): string | null {
  const withRental = appointments.filter((a) => a.rentalItemId);
  if (!withRental.length) return null;
  return [...withRental].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime(),
  )[0].id;
}

export function rentalAmountForSlot(
  appointmentId: string,
  chargeAppointmentId: string | null,
  itemPrice: number,
  quantity: number,
): number {
  if (!chargeAppointmentId || appointmentId !== chargeAppointmentId) return 0;
  return rentalLineTotal(itemPrice, quantity);
}

export async function loadDailyRentalAppointments(
  db: DbClient,
  params: {
    clientId: string;
    branchId: string;
    dateKey: string;
  },
): Promise<RentalAppointmentRow[]> {
  const { dayStart, dayEnd } = dayBounds(params.dateKey);
  return db.appointment.findMany({
    where: {
      clientId: params.clientId,
      branchId: params.branchId,
      startAt: { gte: dayStart, lt: dayEnd },
      status: { not: "deleted" },
      rentalItemId: { not: null },
    },
    select: {
      id: true,
      startAt: true,
      rentalItemId: true,
      rentalQuantity: true,
      rentalAmount: true,
      price: true,
    },
    orderBy: { startAt: "asc" },
  });
}

export async function computeRentalAmount(
  db: DbClient,
  params: {
    appointmentId?: string;
    startAt: Date;
    clientId?: string;
    branchId: string;
    rentalItemId: string | null;
    rentalQuantity: number;
  },
): Promise<{
  amount: number;
  chargedOnThisAppointment: boolean;
  chargeAppointmentId: string | null;
  hint?: string;
}> {
  if (!params.rentalItemId || params.rentalQuantity <= 0) {
    return {
      amount: 0,
      chargedOnThisAppointment: false,
      chargeAppointmentId: null,
    };
  }

  const item = await db.branchRentalItem.findFirst({
    where: {
      id: params.rentalItemId,
      branchId: params.branchId,
      isActive: true,
    },
  });
  if (!item) {
    return {
      amount: 0,
      chargedOnThisAppointment: false,
      chargeAppointmentId: null,
    };
  }

  const dateKey = formatDateKey(params.startAt);
  let dayRows: Pick<RentalAppointmentRow, "id" | "startAt" | "rentalItemId">[] =
    [];
  if (params.clientId) {
    const loaded = await loadDailyRentalAppointments(db, {
      clientId: params.clientId,
      branchId: params.branchId,
      dateKey,
    });
    dayRows = params.appointmentId
      ? loaded.filter((r) => r.id !== params.appointmentId)
      : loaded;
  }

  const candidateId = params.appointmentId ?? "__candidate__";
  const chargeId = pickRentalChargeAppointmentId([
    ...dayRows,
    {
      id: candidateId,
      startAt: params.startAt,
      rentalItemId: params.rentalItemId,
    },
  ]);

  const chargedOnThis = chargeId === candidateId;
  const amount = chargedOnThis
    ? rentalLineTotal(item.price, params.rentalQuantity)
    : 0;

  return {
    amount,
    chargedOnThisAppointment: chargedOnThis,
    chargeAppointmentId: chargeId === "__candidate__" ? null : chargeId,
    hint:
      !chargedOnThis && chargeId
        ? "Инвентарь уже оплачен в другой записи за этот день"
        : undefined,
  };
}

export async function applyAppointmentRental(
  db: DbClient,
  appointmentId: string,
  rental: { rentalItemId: string | null; rentalQuantity: number },
  opts?: { priceOverride?: number },
) {
  const appt = await db.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { client: true },
  });

  await db.appointment.update({
    where: { id: appointmentId },
    data: {
      rentalItemId: rental.rentalItemId,
      rentalQuantity: rental.rentalQuantity,
    },
  });

  const dateKey = formatDateKey(appt.startAt);
  await reconcileDailyRentalCharges(db, {
    clientId: appt.clientId,
    branchId: appt.branchId,
    dateKey,
  });

  if (opts?.priceOverride != null) {
    await db.appointment.update({
      where: { id: appointmentId },
      data: { price: opts.priceOverride },
    });
  }
}

export async function reconcileDailyRentalCharges(
  db: DbClient,
  params: {
    clientId: string;
    branchId: string;
    dateKey: string;
  },
) {
  const rows = await loadDailyRentalAppointments(db, params);
  if (!rows.length) return;

  const chargeId = pickRentalChargeAppointmentId(rows);
  const items = await db.branchRentalItem.findMany({
    where: { branchId: params.branchId },
  });
  const priceById = new Map(items.map((i) => [i.id, i.price]));

  await Promise.all(
    rows.map(async (row) => {
      const itemPrice = row.rentalItemId
        ? (priceById.get(row.rentalItemId) ?? 0)
        : 0;
      const newRental = rentalAmountForSlot(
        row.id,
        chargeId,
        itemPrice,
        row.rentalQuantity,
      );
      if (Math.abs(newRental - row.rentalAmount) < 0.001) return;
      const newPrice = Math.round((row.price - row.rentalAmount + newRental) * 100) / 100;
      await db.appointment.update({
        where: { id: row.id },
        data: { rentalAmount: newRental, price: newPrice },
      });
    }),
  );
}

export async function ensureBranchRentalDefaults(
  db: DbClient,
  branchId: string,
) {
  const count = await db.branchRentalItem.count({ where: { branchId } });
  if (count > 0) return;
  await db.branchRentalItem.createMany({
    data: DEFAULT_BRANCH_RENTAL_ITEMS.map((item) => ({
      branchId,
      ...item,
    })),
  });
}

export function serviceSupportsRental(serviceKind: string): boolean {
  return serviceKind === "wake" || serviceKind === "sup";
}
