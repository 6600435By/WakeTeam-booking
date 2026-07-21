"use client";

import { useEffect, useState } from "react";
import { formatDateKeyRu } from "@/lib/time";
import { periodLast15Days } from "@/lib/date-ranges";
import type { ShiftAssignmentsReportRow } from "@/lib/payroll/shift-baseline-tasks";
import {
  spotTaskStatusLabel,
  workShiftStatusLabel,
} from "@/lib/payroll/spot-task-status";
import { useSuperAdminBranchOptional } from "@/components/admin/SuperAdminBranchProvider";
import { DatePickerField } from "@/components/admin/DatePickerField";
import { ShiftPayrollPanel } from "./ShiftPayrollPanel";

type ReviewTab = "payroll" | "baseline";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

export function ShiftReviewPage({
  usesBranchPicker = true,
  branchId: fixedBranchId = null,
  isSuperAdmin = false,
  isBranchAdmin = false,
  isBranchManager = false,
}: {
  usesBranchPicker?: boolean;
  branchId?: string | null;
  isSuperAdmin?: boolean;
  isBranchAdmin?: boolean;
  isBranchManager?: boolean;
}) {
  const superBranch = useSuperAdminBranchOptional();
  const defaultPeriod = periodLast15Days();
  const [tab, setTab] = useState<ReviewTab>("payroll");
  const [reviewBranchId, setReviewBranchId] = useState(
    () => fixedBranchId ?? superBranch?.branchId ?? "",
  );
  const [baselineFrom, setBaselineFrom] = useState(defaultPeriod.from);
  const [baselineTo, setBaselineTo] = useState(defaultPeriod.to);
  const [baselineRows, setBaselineRows] = useState<ShiftAssignmentsReportRow[]>([]);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (usesBranchPicker && superBranch?.branchId) {
      setReviewBranchId((prev) => prev || superBranch.branchId);
    }
  }, [usesBranchPicker, superBranch?.branchId]);

  function applyReviewBranch(id: string) {
    setReviewBranchId(id);
    if (usesBranchPicker && id) superBranch?.setBranchId(id);
  }

  async function loadBaselineReport() {
    setBaselineLoading(true);
    setError("");
    const q = new URLSearchParams({ from: baselineFrom, to: baselineTo });
    const bid = fixedBranchId ?? reviewBranchId;
    if (bid) q.set("branchId", bid);
    const r = await fetch(`/api/admin/shift-baseline-report?${q}`);
    const d = await r.json();
    setBaselineLoading(false);
    if (!r.ok) {
      setError(typeof d.error === "string" ? d.error : "Ошибка загрузки");
      setBaselineRows([]);
      return;
    }
    setBaselineRows(d.rows ?? []);
  }

  useEffect(() => {
    if (tab === "baseline") void loadBaselineReport();
  }, [tab, baselineFrom, baselineTo, fixedBranchId, reviewBranchId]);

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <h1 className="text-xl font-bold">Проверка смен</h1>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setTab("payroll")}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            tab === "payroll"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600"
          }`}
        >
          ЗП
        </button>
        <button
          type="button"
          onClick={() => setTab("baseline")}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            tab === "baseline"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600"
          }`}
        >
          Задания
        </button>
      </div>

      {tab === "payroll" && (
        <ShiftPayrollPanel
          isSuperAdmin={isSuperAdmin}
          isBranchAdmin={isBranchAdmin}
          isBranchManager={isBranchManager}
        />
      )}

      {tab === "baseline" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-600">
              Задания на смену, индивидуальные задания, чеклист и комментарии по
              каждой смене
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <DatePickerField
                label="Период с"
                value={baselineFrom}
                max={baselineTo}
                onChange={setBaselineFrom}
                className={inputClass}
              />
              <DatePickerField
                label="Период по"
                value={baselineTo}
                min={baselineFrom}
                onChange={setBaselineTo}
                className={inputClass}
              />
              {usesBranchPicker && (superBranch?.branches.length ?? 0) > 0 && (
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-slate-500">Филиал</span>
                  <select
                    className={inputClass}
                    value={reviewBranchId}
                    onChange={(e) => applyReviewBranch(e.target.value)}
                  >
                    <option value="">Все филиалы</option>
                    {superBranch!.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <button
              type="button"
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
              onClick={() => void loadBaselineReport()}
            >
              Обновить
            </button>
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          {baselineLoading && <p className="text-sm text-slate-500">Загрузка…</p>}
          {!baselineLoading && baselineRows.length === 0 && (
            <p className="text-sm text-slate-500">Нет смен за период</p>
          )}
          {baselineRows.map((row) => (
            <div
              key={row.shiftId}
              className="rounded-xl border border-slate-200 bg-white p-4 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{row.memberName}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateKeyRu(row.date)} · {row.branchName}
                  </p>
                </div>
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600">
                  {workShiftStatusLabel(row.shiftStatus)}
                </span>
              </div>

              {row.baselineTasks.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-violet-700">Задания на смену</p>
                  <ul className="mt-1 space-y-1 text-slate-700">
                    {row.baselineTasks.map((t) => (
                      <li key={t.id}>
                        {t.completed ? "✓ " : "○ "}
                        {t.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {row.spotTasks.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500">Задания оператору</p>
                  <ul className="mt-1 space-y-1 text-slate-700">
                    {row.spotTasks.map((t) => (
                      <li key={t.id}>
                        {t.description}
                        {t.plannedLabel ? ` · ${t.plannedLabel}` : ""} ·{" "}
                        {spotTaskStatusLabel(t.status)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {row.checklist.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500">Чеклист филиала</p>
                  <ul className="mt-1 space-y-1 text-slate-700">
                    {row.checklist.map((item) => (
                      <li key={item.id}>
                        {item.completed ? "✓ " : "○ "}
                        {item.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {row.handoffNotes.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500">Комментарии смены</p>
                  <ul className="mt-1 space-y-2">
                    {row.handoffNotes.map((n, i) => (
                      <li
                        key={i}
                        className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2"
                      >
                        <p className="text-xs text-amber-900">
                          для смены {formatDateKeyRu(n.targetDate)}
                        </p>
                        <p className="mt-0.5 text-slate-800">{n.comment}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {row.baselineTasks.length === 0 &&
                row.spotTasks.length === 0 &&
                row.checklist.length === 0 &&
                row.handoffNotes.length === 0 && (
                  <p className="mt-3 text-xs text-slate-400">Нет заданий и комментариев</p>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
