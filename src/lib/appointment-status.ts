export type AppointmentStatus =
  | "booked"
  | "in_service"
  | "completed"
  | "awaiting_prepayment"
  | "cancelled"
  | "awaiting_confirmation"
  | "in_cart"
  | "rescheduling"
  | "no_show"
  | "deleted"
  | "confirmed";

export type StatusDef = {
  value: AppointmentStatus;
  label: string;
  /** Блок в сетке журнала */
  block: string;
  /** Точка-индикатор */
  dot: string;
  /** Бейдж в таблице */
  badge: string;
  /** Заголовок колонки (канбан) */
  column: string;
  blocksSlot: boolean;
};

const defs: StatusDef[] = [
  {
    value: "booked",
    label: "Записан",
    block: "border-l-4 border-amber-400 bg-amber-50 text-amber-950",
    dot: "bg-amber-400",
    badge: "bg-amber-100 text-amber-900 ring-amber-200",
    column: "bg-amber-50 border-amber-200",
    blocksSlot: true,
  },
  {
    value: "in_service",
    label: "На обслуживании",
    block: "border-l-4 border-sky-500 bg-sky-50 text-sky-950",
    dot: "bg-sky-500",
    badge: "bg-sky-100 text-sky-900 ring-sky-200",
    column: "bg-sky-50 border-sky-200",
    blocksSlot: true,
  },
  {
    value: "completed",
    label: "Завершен",
    block: "border-l-4 border-emerald-500 bg-emerald-50 text-emerald-950",
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    column: "bg-emerald-50 border-emerald-200",
    blocksSlot: false,
  },
  {
    value: "awaiting_prepayment",
    label: "Ожидание предоплаты",
    block: "border-l-4 border-slate-400 bg-slate-100 text-slate-800",
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-700 ring-slate-200",
    column: "bg-slate-50 border-slate-200",
    blocksSlot: true,
  },
  {
    value: "cancelled",
    label: "Отменен",
    block: "border-l-4 border-red-300 bg-red-50 text-red-900 line-through opacity-80",
    dot: "bg-red-400",
    badge: "bg-red-50 text-red-800 ring-red-200",
    column: "bg-red-50 border-red-200",
    blocksSlot: false,
  },
  {
    value: "deleted",
    label: "Удалена",
    block: "border-l-4 border-red-400 bg-red-100/80 text-red-900 line-through opacity-75",
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-900 ring-red-300",
    column: "bg-red-50 border-red-300",
    blocksSlot: false,
  },
  {
    value: "awaiting_confirmation",
    label: "Ожидает подтверждения",
    block: "border-l-4 border-violet-500 bg-violet-50 text-violet-950",
    dot: "bg-violet-500",
    badge: "bg-violet-100 text-violet-900 ring-violet-200",
    column: "bg-violet-50 border-violet-200",
    blocksSlot: true,
  },
  {
    value: "in_cart",
    label: "Добавлено в корзину",
    block: "border-l-4 border-slate-300 bg-white text-slate-800 ring-1 ring-inset ring-slate-200",
    dot: "bg-slate-300",
    badge: "bg-white text-slate-700 ring-slate-200",
    column: "bg-white border-slate-200",
    blocksSlot: true,
  },
  {
    value: "rescheduling",
    label: "Перенос записи",
    block: "border-l-4 border-fuchsia-500 bg-fuchsia-100 text-fuchsia-950",
    dot: "bg-fuchsia-500",
    badge: "bg-fuchsia-100 text-fuchsia-900 ring-fuchsia-200",
    column: "bg-fuchsia-50 border-fuchsia-300",
    blocksSlot: true,
  },
  {
    value: "no_show",
    label: "Не пришёл",
    block: "border-l-4 border-stone-400 bg-stone-100 text-stone-700 opacity-90",
    dot: "bg-stone-400",
    badge: "bg-stone-100 text-stone-700 ring-stone-200",
    column: "bg-stone-50 border-stone-200",
    blocksSlot: false,
  },
];

const byValue = new Map<string, StatusDef>(
  defs.map((d) => [d.value, d]),
);

/** Старые значения из ранних версий */
const aliases: Record<string, AppointmentStatus> = {
  confirmed: "awaiting_confirmation",
};

export function normalizeStatus(status: string): AppointmentStatus {
  const aliased = aliases[status] ?? status;
  if (byValue.has(aliased)) return aliased as AppointmentStatus;
  return "booked";
}

export function getStatusDef(status: string): StatusDef {
  return byValue.get(normalizeStatus(status)) ?? byValue.get("booked")!;
}

export function statusLabel(status: string): string {
  return getStatusDef(status).label;
}

export function statusBlockClass(status: string): string {
  return getStatusDef(status).block;
}

export function statusDotClass(status: string): string {
  return getStatusDef(status).dot;
}

export function statusBadgeClass(status: string): string {
  return getStatusDef(status).badge;
}

export function statusColumnClass(status: string): string {
  return getStatusDef(status).column;
}

/** @deprecated use statusBlockClass */
export function statusColor(status: string): string {
  return statusBlockClass(status);
}

export const APPOINTMENT_STATUS_OPTIONS = defs.filter((d) =>
  ["booked", "in_service", "completed", "no_show"].includes(d.value),
);

/** Не показывать в сетке журнала — слот свободен */
export const JOURNAL_HIDDEN_STATUSES = ["deleted", "cancelled"] as const;

export type CancelReason = "client" | "admin" | "weather";

export const CANCEL_REASON_OPTIONS: { value: CancelReason; label: string }[] = [
  { value: "client", label: "Клиент" },
  { value: "admin", label: "Админ" },
  { value: "weather", label: "Погода" },
];

export function cancelReasonLabel(reason: string | null | undefined): string {
  return CANCEL_REASON_OPTIONS.find((r) => r.value === reason)?.label ?? "";
}

export const SLOT_BLOCKING_STATUSES = defs
  .filter((d) => d.blocksSlot)
  .map((d) => d.value);

/** Для Prisma: занятые слоты + legacy confirmed */
export const ACTIVE_APPOINTMENT_STATUSES = [
  ...SLOT_BLOCKING_STATUSES,
  "confirmed",
];

export const BOARD_STATUSES = [
  "booked",
  "in_service",
  "completed",
  "cancelled",
  "deleted",
  "no_show",
] as const;

/** Запись считается завершённой для смены / журнала */
export const FINISHED_APPOINTMENT_STATUSES = new Set<AppointmentStatus>([
  "completed",
  "cancelled",
  "deleted",
  "no_show",
]);

export function isUnfinishedAppointmentStatus(status: string): boolean {
  return !FINISHED_APPOINTMENT_STATUSES.has(normalizeStatus(status));
}

export function serviceRequiresOperator(serviceKind: string | null | undefined): boolean {
  return serviceKind !== "sup";
}

export function validateOperatorForCompletedStatus(
  nextStatus: string | undefined,
  operatorMemberId: string | null | undefined,
  serviceKind?: string | null,
): string | null {
  if (!serviceRequiresOperator(serviceKind)) return null;
  if (normalizeStatus(nextStatus ?? "") !== "completed") return null;
  if (!operatorMemberId) {
    return "Выберите оператора перед завершением записи";
  }
  return null;
}
