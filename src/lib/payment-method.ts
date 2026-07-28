export type PaymentMethod = "cash" | "card" | "corporate" | "split";

/** Filter / tender options in admin UI — only cash and card. */
export const PAYMENT_METHOD_OPTIONS: {
  value: "cash" | "card";
  label: string;
}[] = [
  { value: "cash", label: "Наличные" },
  { value: "card", label: "Карта" },
];

/** @deprecated use PAYMENT_METHOD_OPTIONS */
export const PAYMENT_TENDER_OPTIONS = PAYMENT_METHOD_OPTIONS;

const LEGACY_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  corporate: "Карта",
  split: "Наличные + карта",
};

export function paymentMethodLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return (
    PAYMENT_METHOD_OPTIONS.find((o) => o.value === value)?.label ??
    LEGACY_LABELS[value] ??
    value
  );
}

/** Human label from amounts (preferred) or legacy paymentMethod. */
export function appointmentPaymentLabel(input: {
  paymentMethod?: string | null;
  cashAmount?: number | null;
  cardAmount?: number | null;
}): string {
  const cash = Number(input.cashAmount) || 0;
  const card = Number(input.cardAmount) || 0;
  if (cash > 0 && card > 0) {
    return `Наличные ${formatBr(cash)} · Карта ${formatBr(card)}`;
  }
  if (cash > 0) return `Наличные ${formatBr(cash)}`;
  if (card > 0) return `Карта ${formatBr(card)}`;
  return paymentMethodLabel(input.paymentMethod);
}

function formatBr(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded} Br` : `${rounded.toFixed(2)} Br`;
}

export function isPaymentMethod(value: string): value is PaymentMethod {
  return value === "cash" || value === "card" || value === "corporate" || value === "split";
}
