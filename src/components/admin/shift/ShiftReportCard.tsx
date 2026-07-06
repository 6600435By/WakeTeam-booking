"use client";

import { useState } from "react";
import { formatDateKeyRu } from "@/lib/time";
import { formatMoney, formatDurationMinutes } from "@/lib/payroll/shift-summary";
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
  efficiencyPercent?: number | null;
  idleSharePercent?: number | null;
};

type BranchSales = {
  cash: number;
  cashless: number;
  total: number;
  appointmentCount: number;
};

type BranchDayStaffRow = {
  shiftId: string;
  memberId: string;
  memberName: string;
  role: string;
  status: string;
  panelMinutes: number;
  spotMinutes: number;
  idleMinutes: number;
  shiftMinutes: number;
  totalAmount: number;
};

export type ShiftReportView = "operator" | "admin" | "manager";

export type ShiftData = {
  shift: {
    id: string;
    date: string;
    branchId: string;
    memberId?: string;
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
    workAsAdmin?: boolean;
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
  spotTasks?: {
    id: string;
    description: string;
    status: string;
    plannedMinutes: number | null;
    plannedTimeFrom?: string | null;
    plannedTimeTo?: string | null;
    spotEntryId?: string | null;
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
  reviewNotes?: {
    noteForManager: string | null;
    noteForSuperAdmin: string | null;
  };
  branchSales?: BranchSales | null;
  branchDaySummary?: {
    staffOnShift: BranchDayStaffRow[];
    totals: {
      panelMinutes: number;
      spotMinutes: number;
      idleMinutes: number;
      shiftMinutes: number;
      totalAmount: number;
    };
    sales: BranchSales;
  } | null;
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

function MetricPill({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-bold text-slate-900">{value}</p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

export function ShiftReportCard({
  data,
  view = "operator",
  highlightedMemberId,
}: {
  data: ShiftData;
  view?: ShiftReportView;
  highlightedMemberId?: string;
}) {
  const { shift, summary } = data;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const showBranchSummary = view === "admin" || view === "manager";
  const sales = data.branchSales ?? data.branchDaySummary?.sales ?? null;

  const timeRange =
    shift.actualStart && shift.actualEnd
      ? `${new Date(shift.actualStart).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}–${new Date(shift.actualEnd).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
      : shift.actualStart
        ? `с ${new Date(shift.actualStart).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
        : "";

  const checklistDone =
    data.checklistItems?.filter((i) => i.completed).length ?? 0;
  const checklistTotal = data.checklistItems?.length ?? 0;
  const baselineDone = data.baselineTasks?.filter((t) => t.completed).length ?? 0;
  const baselineTotal = data.baselineTasks?.length ?? 0;
  const tasksDone =
    data.spotTasks?.filter((t) => t.status === "done").length ?? 0;
  const tasksTotal = data.spotTasks?.length ?? 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            {view === "operator" ? "Моя смена" : "Отчёт по смене"}{" "}
            {formatDateKeyRu(shift.date)}
            {timeRange ? ` · ${timeRange}` : ""}
          </h3>
          <p className="text-xs text-slate-500">
            {shift.memberName}
            {shift.branchName ? ` · ${shift.branchName}` : ""}
            {" · "}
            {statusLabel[shift.status] ?? shift.status}
          </p>
          {shift.status === "closed" && view === "operator" && (
            <p className="text-xs text-amber-700">
              {shift.employeeSubmittedAt ? "Подтверждено вами" : "Ожидает вашей проверки"}
            </p>
          )}
        </div>
        <p className="text-lg font-bold text-slate-900">
          {formatMoney(summary.totalAmount)} BYN
        </p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricPill label="ЗП" value={`${formatMoney(summary.totalAmount)}`} sub="BYN" />
        {summary.isOperator ? (
          <>
            <MetricPill
              label="Пульт"
              value={formatDurationMinutes(summary.panelMinutes)}
            />
            <MetricPill
              label="Спот"
              value={formatDurationMinutes(summary.spotMinutes)}
            />
            <MetricPill
              label="Простой"
              value={formatDurationMinutes(summary.idleMinutes)}
              sub={
                summary.idleSharePercent != null
                  ? `${summary.idleSharePercent}%`
                  : undefined
              }
            />
          </>
        ) : (
          <div className="col-span-2 sm:col-span-3">
            <MetricPill
              label="Часы"
              value={formatDurationMinutes(summary.shiftMinutes)}
            />
          </div>
        )}
      </div>

      {summary.efficiencyPercent != null && summary.isOperator && (
        <p className="mb-3 text-xs text-slate-600">
          Эффективность: <span className="font-medium">{summary.efficiencyPercent}%</span>
          {summary.idleSharePercent != null && summary.idleSharePercent > 20 && (
            <span className="text-amber-700">
              {" "}
              · высокий простой ({summary.idleSharePercent}%)
            </span>
          )}
        </p>
      )}

      {showBranchSummary && sales && (
        <div className="mb-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
          <p className="text-xs font-medium text-emerald-900">Продажи филиала за смену</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-emerald-950">
            <span>Нал: {formatMoney(sales.cash)} BYN</span>
            <span>Безнал: {formatMoney(sales.cashless)} BYN</span>
            <span className="font-semibold">Итого: {formatMoney(sales.total)} BYN</span>
            <span className="text-xs text-emerald-800">({sales.appointmentCount} записей)</span>
          </div>
        </div>
      )}

      {showBranchSummary && data.branchDaySummary && (
        <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-medium text-slate-700">Сотрудники на смене</p>
          <div className="space-y-1">
            {data.branchDaySummary.staffOnShift.map((row) => {
              const isSelf =
                highlightedMemberId === row.memberId ||
                shift.memberId === row.memberId;
              return (
                <div
                  key={row.shiftId}
                  className={`flex flex-wrap justify-between gap-1 text-xs ${
                    isSelf ? "font-medium text-slate-900" : "text-slate-600"
                  }`}
                >
                  <span>{row.memberName}</span>
                  <span>
                    пульт {formatDurationMinutes(row.panelMinutes)} · спот{" "}
                    {formatDurationMinutes(row.spotMinutes)} · простой{" "}
                    {formatDurationMinutes(row.idleMinutes)}
                    {isSelf ? ` · ${formatMoney(row.totalAmount)} BYN` : ""}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
            Всего: пульт {formatDurationMinutes(data.branchDaySummary.totals.panelMinutes)},
            спот {formatDurationMinutes(data.branchDaySummary.totals.spotMinutes)}, простой{" "}
            {formatDurationMinutes(data.branchDaySummary.totals.idleMinutes)}
          </p>
        </div>
      )}

      {(checklistTotal > 0 || baselineTotal > 0 || tasksTotal > 0) && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {checklistTotal > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
              Чеклист {checklistDone}/{checklistTotal}
            </span>
          )}
          {baselineTotal > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
              Задания {baselineDone}/{baselineTotal}
            </span>
          )}
          {tasksTotal > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
              Спот-задачи {tasksDone}/{tasksTotal}
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        className="mb-2 text-xs text-lime-700 hover:underline"
        onClick={() => setDetailsOpen((v) => !v)}
      >
        {detailsOpen ? "Скрыть детали" : "Показать детали"}
      </button>

      {detailsOpen && (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          <div className="space-y-2">
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

          {(data.checklistItems?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Чеклист</p>
              <ul className="space-y-0.5">
                {data.checklistItems!.map((item) => (
                  <li key={item.id} className="text-xs text-slate-700">
                    {item.completed ? "✓" : "○"} {item.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(data.baselineTasks?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Базовые задания</p>
              <ul className="space-y-0.5">
                {data.baselineTasks!.map((t) => (
                  <li key={t.id} className="text-xs text-slate-700">
                    {t.completed ? "✓" : "○"} {t.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(data.spotTasks?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Задания на споте</p>
              <ul className="space-y-0.5">
                {data.spotTasks!.map((t) => (
                  <li key={t.id} className="text-xs text-slate-700">
                    {t.description} — {t.status}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.spotEntries.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Работа на споте</p>
              <ul className="space-y-0.5">
                {data.spotEntries.map((e) => (
                  <li key={e.id} className="text-xs text-slate-600">
                    {new Date(e.startedAt).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {e.endedAt &&
                      `–${new Date(e.endedAt).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`}
                    {e.category ? ` · ${spotCategoryLabel(e.category)}` : ""}
                    {e.comment ? ` — ${e.comment}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {shift.employeeSubmitComment && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          Комментарий сотрудника: {shift.employeeSubmitComment}
        </p>
      )}

      {data.reviewNotes?.noteForManager && (
        <p className="mt-2 rounded-lg bg-blue-50 px-2 py-1.5 text-xs text-blue-900">
          Замечание для управляющего: {data.reviewNotes.noteForManager}
        </p>
      )}

      {data.reviewNotes?.noteForSuperAdmin && view === "manager" && (
        <p className="mt-2 rounded-lg bg-violet-50 px-2 py-1.5 text-xs text-violet-900">
          Для супер-админа: {data.reviewNotes.noteForSuperAdmin}
        </p>
      )}
    </div>
  );
}

export type { ShiftSummary };
