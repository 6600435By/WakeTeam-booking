import { resolveServicePrice, type ServicePriceRuleDto } from "@/lib/service-pricing";
import type { PaymentMethod } from "@/lib/payment-method";

export const PAYMENT_AMOUNT_EPS = 0.01;

export type MonetaryDueInput = {
  service: {
    price: number;
    durationMinutes: number;
    priceRules?: ServicePriceRuleDto[];
  };
  startAt: Date;
  durationMinutes: number;
  /** When membership covers service minutes, only rental is due. */
  membershipId?: string | null;
  rentalAmount?: number;
  pricingWeekday?: number;
};

/** Money the client owes in cash/card (membership minutes are not money). */
export function resolveMonetaryDue(input: MonetaryDueInput): number {
  const rental = Math.max(0, input.rentalAmount ?? 0);
  if (input.membershipId) {
    return Math.round(rental * 100) / 100;
  }
  const servicePrice = resolveServicePrice(
    input.service,
    input.startAt,
    input.durationMinutes,
    { pricingWeekday: input.pricingWeekday },
  );
  return Math.round((servicePrice + rental) * 100) / 100;
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function amountsMatchDue(
  cashAmount: number,
  cardAmount: number,
  due: number,
): boolean {
  return Math.abs(roundMoney(cashAmount + cardAmount) - roundMoney(due)) < PAYMENT_AMOUNT_EPS;
}

export function derivePaymentMethod(
  cashAmount: number,
  cardAmount: number,
): PaymentMethod | "split" | null {
  const cash = roundMoney(cashAmount);
  const card = roundMoney(cardAmount);
  if (cash <= 0 && card <= 0) return null;
  if (cash > 0 && card > 0) return "split";
  if (cash > 0) return "cash";
  return "card";
}

export function paymentAmountsMismatchError(
  cashAmount: number,
  cardAmount: number,
  due: number,
): Error {
  const sum = roundMoney(cashAmount + cardAmount);
  const err = new Error("PAYMENT_AMOUNTS_MISMATCH");
  (err as Error & { due: number; sum: number }).due = roundMoney(due);
  (err as Error & { due: number; sum: number }).sum = sum;
  return err;
}

export function assertPaymentAmountsMatch(
  cashAmount: number,
  cardAmount: number,
  due: number,
): void {
  if (!amountsMatchDue(cashAmount, cardAmount, due)) {
    throw paymentAmountsMismatchError(cashAmount, cardAmount, due);
  }
}
