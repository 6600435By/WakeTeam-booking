export type PaymentMethod = "cash" | "card" | "corporate" | "split";

/** Options shown in filters / legacy labels (corporate kept for old rows). */
export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Наличные" },
  { value: "card", label: "Карта" },
  { value: "split", label: "Наличные + карта" },
  { value: "corporate", label: "Корпо" },
];

/** Tender buttons in appointment form — cash / card only (amounts UI). */
export const PAYMENT_TENDER_OPTIONS: { value: "cash" | "card"; label: string }[] =
  [
    { value: "cash", label: "Наличные" },
    { value: "card", label: "Карта" },
  ];

export function paymentMethodLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return PAYMENT_METHOD_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function isPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHOD_OPTIONS.some((o) => o.value === value);
}
