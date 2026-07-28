import type { DbClient } from "@/lib/db-types";
import {
  assertPaymentAmountsMatch,
  derivePaymentMethod,
  resolveMonetaryDue,
  roundMoney,
} from "@/lib/payment-amounts";
import { parsePricesByDuration } from "@/lib/service-pricing";
import { formatDateKey, weekdayMinsk } from "@/lib/time";

export async function loadServicePriceRules(
  db: DbClient,
  serviceId: string,
): Promise<{
  price: number;
  durationMinutes: number;
  priceRules: {
    weekdays: string;
    timeFrom: string;
    timeTo: string;
    price: number;
    pricesByDuration?: Record<number, number>;
    sortOrder?: number;
  }[];
}> {
  const service = await db.service.findUniqueOrThrow({
    where: { id: serviceId },
    include: { priceRules: { orderBy: [{ timeFrom: "asc" }, { sortOrder: "asc" }] } },
  });
  return {
    price: service.price,
    durationMinutes: service.durationMinutes,
    priceRules: service.priceRules.map((r) => ({
      weekdays: r.weekdays,
      timeFrom: r.timeFrom,
      timeTo: r.timeTo,
      price: r.price,
      pricesByDuration: parsePricesByDuration(r.pricesByDuration),
      sortOrder: r.sortOrder,
    })),
  };
}

export type PaymentAmountsInput = {
  cashAmount?: number;
  cardAmount?: number;
  /** When true, validate cash+card against computed due and set price/paymentMethod. */
  validate?: boolean;
};

/**
 * Persist cash/card amounts; optionally validate against monetary due.
 * `price` becomes the money collected (cash+card).
 */
export async function applyAppointmentPaymentAmounts(
  db: DbClient,
  appointmentId: string,
  amounts: { cashAmount: number; cardAmount: number },
  opts?: {
    membershipId?: string | null;
    durationMinutes?: number;
    startAt?: Date;
    serviceId?: string;
    rentalAmount?: number;
    /** When set, validate against this instead of recomputing tariff. */
    dueOverride?: number;
    validate?: boolean;
  },
): Promise<void> {
  const cashAmount = roundMoney(amounts.cashAmount);
  const cardAmount = roundMoney(amounts.cardAmount);

  if (opts?.validate !== false) {
    let due: number;
    if (opts?.dueOverride != null && Number.isFinite(opts.dueOverride)) {
      due = roundMoney(opts.dueOverride);
    } else {
      const appt = await db.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: {
          membershipId: true,
          durationMinutes: true,
          startAt: true,
          serviceId: true,
          rentalAmount: true,
          branchId: true,
        },
      });
      const membershipId =
        opts?.membershipId !== undefined ? opts.membershipId : appt.membershipId;
      const durationMinutes = opts?.durationMinutes ?? appt.durationMinutes;
      const startAt = opts?.startAt ?? appt.startAt;
      const serviceId = opts?.serviceId ?? appt.serviceId;
      const rentalAmount = opts?.rentalAmount ?? appt.rentalAmount;
      const service = await loadServicePriceRules(db, serviceId);
      due = resolveMonetaryDue({
        service,
        startAt,
        durationMinutes,
        membershipId,
        rentalAmount,
        pricingWeekday: weekdayMinsk(formatDateKey(startAt)),
      });
    }
    assertPaymentAmountsMatch(cashAmount, cardAmount, due);
  }

  const paymentMethod = derivePaymentMethod(cashAmount, cardAmount);
  const price = roundMoney(cashAmount + cardAmount);

  await db.appointment.update({
    where: { id: appointmentId },
    data: {
      cashAmount,
      cardAmount,
      paymentMethod,
      price,
    },
  });
}

/** When amounts omitted, derive from legacy paymentMethod + price. */
export function legacyAmountsFromPaymentMethod(
  paymentMethod: string | null | undefined,
  price: number,
): { cashAmount: number; cardAmount: number } {
  const p = roundMoney(price);
  if (paymentMethod === "cash") return { cashAmount: p, cardAmount: 0 };
  if (paymentMethod === "card" || paymentMethod === "corporate") {
    return { cashAmount: 0, cardAmount: p };
  }
  if (paymentMethod === "split") {
    return { cashAmount: 0, cardAmount: p };
  }
  // No method: treat full price as card (cashless) for shift totals parity
  return { cashAmount: 0, cardAmount: p };
}
