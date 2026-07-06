"use client";

import { formatDateKeyRu } from "@/lib/time";
import { formatMoney } from "@/lib/payroll/shift-summary";
import { spotCategoryLabel } from "@/lib/payroll/spot-categories";

type ShiftLine = {
  kind: string;
  label: string;
  minutes: number;
  hoursLabel: string;
  rate: number | null;
  amount: number;
  rateMissing: boolean;
  details?: { time: string; comment: string }[];
};

type ShiftSummary = {
  shiftMinutes: number;
  panelMinutes: number;
  spotMinutes: number;
  idleMinutes: number;
  totalAmount: number;
  lines: ShiftLine[];
  isOperator: boolean;
};

export type ShiftData = {
  shift: {
    id: string;
    date: string;
    branchId: string;
    status: string;
    plannedStart: string | null;
    plannedEnd: string | null;
    actualStart: string | null;
    actualEnd: string | null;
    employeeSubmittedAt?: string | null;
    employeeSubmitComment?: string | null;
    memberName: string;
    branchName: string | null;
    role: string;
  };
  reverseAssignments: {
    id: string;
    staffId: string;
    staffName: string;
    startedAt: string;
    endedAt: string | null;
  }[];
  spotEntries: {
    id: string;
    taskId: string | null;
    category: string | null;
    comment: string;
    startedAt: string;
    endedAt: string | null;
    isActive: boolean;
    confirmedAt?: string | null;
  }[];
  baselineTasks?: {
    id: string;
    description: string;
    completed: boolean;
  }[];
  checklistItems?: {
    id: string;
    label: string;
    completed: boolean;
  }[];
  summary: ShiftSummary & {
    inServicePanelMinutes?: number;
    inServiceCount?: number;
    unfinishedAppointmentCount?: number;
    unconfirmedSpotMinutes?: number;
  };
};

const statusLabel: Record<string, string> = {
  open: "Идёт",
  closed: "На проверке",
  approved: "Утверждена",
};

export function ShiftReportCard({ data }: { data: ShiftData }) {
  const { shift, summary } = data;
  const timeRange =
    shift.actualStart && shift.actualEnd
      ? `${new Date(shift.actualStart).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}–${new Date(shift.actualEnd).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
      : shift.actualStart
        ? `с ${new Date(shift.actualStart).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
        : "";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Смена {formatDateKeyRu(shift.date)}
            {timeRange ? ` · ${timeRange}` : ""}
          </h3>
          <p className="text-xs text-slate-500">{statusLabel[shift.status] ?? shift.status}</p>
          {shift.status === "closed" && (
            <p className="text-xs text-amber-700">
              {shift.employeeSubmittedAt ? "Подтверждено вами" : "Ожидает вашей проверки"}
            </p>
          )}
        </div>
        <p className="text-lg font-bold text-slate-900">
          {formatMoney(summary.totalAmount)} BYN
        </p>
      </div>
      <div className="space-y-2 border-t border-slate-100 pt-3">
        {summary.lines.map((line) => (
          <div key={line.kind}>
            <div className="flex justify-between text-sm">
              <span className="text-slate-700">{line.label}</span>
              <span className="font-medium text-slate-900">
                {line.hoursLabel}
                {line.rate != null ? ` × ${line.rate} BYN` : ""}
                {" = "}
                {formatMoney(line.amount)} BYN
              </span>
            </div>
            {line.rateMissing && (
              <p className="text-xs text-amber-600">ставка не назначена</p>
            )}
            {line.details?.map((d, i) => (
              <p key={i} className="ml-2 text-xs text-slate-500">
                · {d.time} — {d.comment}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export type { ShiftSummary };
