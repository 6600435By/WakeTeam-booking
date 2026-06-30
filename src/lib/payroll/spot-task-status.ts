export type SpotTaskStatus = "pending" | "in_progress" | "done" | "cancelled";

export const SPOT_TASK_STATUSES: SpotTaskStatus[] = [
  "pending",
  "in_progress",
  "done",
  "cancelled",
];

export function spotTaskStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Ожидает";
    case "in_progress":
      return "В работе";
    case "done":
      return "Выполнено";
    case "cancelled":
      return "Отменено";
    default:
      return status;
  }
}

export function spotTaskStatusClass(status: string): string {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "in_progress":
      return "bg-blue-100 text-blue-800";
    case "done":
      return "bg-green-100 text-green-800";
    case "cancelled":
      return "bg-slate-100 text-slate-500 line-through";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export type WorkShiftStatus = "scheduled" | "open" | "closed" | "approved";

export function workShiftStatusLabel(status: string): string {
  switch (status) {
    case "scheduled":
      return "По графику";
    case "open":
      return "На смене";
    case "closed":
      return "Закрыта";
    case "approved":
      return "Утверждена";
    default:
      return status;
  }
}

export function workShiftStatusClass(status: string): string {
  switch (status) {
    case "scheduled":
      return "bg-violet-100 text-violet-800 border border-violet-200 border-dashed";
    case "open":
      return "bg-green-100 text-green-800";
    case "closed":
      return "bg-slate-100 text-slate-700";
    case "approved":
      return "bg-lime-100 text-lime-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}
