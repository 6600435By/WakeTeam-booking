export const SHIFT_CHANGE_REQUEST_TYPES = [
  { value: "cancel", label: "Отменить смену" },
  { value: "change_time", label: "Изменить время" },
  { value: "change_reverse", label: "Сменить реверс" },
  { value: "other", label: "Другое" },
] as const;

export type ShiftChangeRequestType =
  (typeof SHIFT_CHANGE_REQUEST_TYPES)[number]["value"];

export function shiftChangeRequestTypeLabel(type: string): string {
  return (
    SHIFT_CHANGE_REQUEST_TYPES.find((t) => t.value === type)?.label ?? type
  );
}

export function shiftChangeRequestStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Ожидает";
    case "approved":
      return "Одобрено";
    case "rejected":
      return "Отклонено";
    default:
      return status;
  }
}

export function shiftChangeRequestStatusClass(status: string): string {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "approved":
      return "bg-green-100 text-green-800";
    case "rejected":
      return "bg-red-100 text-red-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}
