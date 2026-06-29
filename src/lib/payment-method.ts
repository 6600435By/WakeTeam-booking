export type PaymentMethod = "cash" | "card" | "corporate";

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Наличные" },
  { value: "card", label: "Карта" },
  { value: "corporate", label: "Корпо" },
];

export function paymentMethodLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return PAYMENT_METHOD_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function isPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHOD_OPTIONS.some((o) => o.value === value);
}
