"use client";

import { useMemo, useState } from "react";
import { DatePickerField } from "@/components/admin/DatePickerField";
import { WeekdayPicker } from "@/components/admin/ServicePriceRulesEditor";
import {
  countBulkShiftSlots,
  countBulkTaskSlots,
} from "@/lib/payroll/shift-schedule-bulk";
import { BRANCH_OPERATOR_ROLE } from "@/lib/admin-roles";

type Member = { memberId: string; name: string; role: string };
type Reverse = { id: string; name: string };

export type BulkFillRow = {
  key: string;
  memberId: string;
  weekdays: string;
  plannedStart: string;
  plannedEnd: string;
  plannedStaffId: string;
  workAsAdmin: boolean;
};

export type BulkTaskRow = {
  key: string;
  weekdays: string;
  description: string;
};

type Props = {
  month: string;
  monthLabel: string;
  branchId: string;
  members: Member[];
  reverses: Reverse[];
  onClose: () => void;
  onDone: (summary: string) => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";
const btn =
  "rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50";
const btnPrimary = `${btn} bg-slate-900 text-white`;
const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-800`;

let rowKey = 0;
function newRow(): BulkFillRow {
  return {
    key: `row-${++rowKey}`,
    memberId: "",
    weekdays: "6,7",
    plannedStart: "10:00",
    plannedEnd: "22:00",
    plannedStaffId: "",
    workAsAdmin: false,
  };
}

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
  };
}

function newTaskRow(): BulkTaskRow {
  return {
    key: `task-${++rowKey}`,
    weekdays: "6,7",
    description: "",
  };
}

export function ShiftBulkFillModal({
  month,
  monthLabel,
  branchId,
  members,
  reverses,
  onClose,
  onDone,
}: Props) {
  const bounds = monthBounds(month);
  const [dateFrom, setDateFrom] = useState(bounds.from);
  const [dateTo, setDateTo] = useState(bounds.to);
  const [rows, setRows] = useState<BulkFillRow[]>([newRow()]);
  const [taskRows, setTaskRows] = useState<BulkTaskRow[]>([]);
  const [skipExisting, setSkipExisting] = useState(true);
  const [replaceScheduled, setReplaceScheduled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filledRows = rows.filter((r) => r.memberId && r.weekdays);
  const filledTaskRows = taskRows.filter(
    (r) => r.description.trim() && r.weekdays,
  );
  const previewCount = useMemo(
    () => countBulkShiftSlots(month, filledRows, dateFrom, dateTo),
    [month, filledRows, dateFrom, dateTo],
  );
  const previewTaskCount = useMemo(
    () => countBulkTaskSlots(month, filledTaskRows, dateFrom, dateTo),
    [month, filledTaskRows, dateFrom, dateTo],
  );

  function updateRow(key: string, patch: Partial<BulkFillRow>) {
    setRows((list) =>
      list.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function addRow() {
    setRows((list) => [...list, newRow()]);
  }

  function removeRow(key: string) {
    setRows((list) => (list.length <= 1 ? list : list.filter((r) => r.key !== key)));
  }

  function removeTaskRow(key: string) {
    setTaskRows((list) => list.filter((r) => r.key !== key));
  }

  function updateTaskRow(key: string, patch: Partial<BulkTaskRow>) {
    setTaskRows((list) =>
      list.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function addTaskRow() {
    setTaskRows((list) => [...list, newTaskRow()]);
  }

  async function submit() {
    if (!branchId) {
      setError("Выберите филиал");
      return;
    }
    if (filledRows.length === 0 && filledTaskRows.length === 0) {
      setError("Добавьте смены или общие задания на смену");
      return;
    }
    for (const row of filledRows) {
      const member = members.find((m) => m.memberId === row.memberId);
      if (member?.role === BRANCH_OPERATOR_ROLE && !row.plannedStaffId) {
        setError(`Выберите реверс для ${member.name}`);
        return;
      }
    }

    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/admin/shift-schedule/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          month,
          dateFrom,
          dateTo,
          skipExisting,
          replaceScheduled,
          rows: filledRows.map((row) => ({
            memberId: row.memberId,
            weekdays: row.weekdays,
            plannedStart: row.plannedStart,
            plannedEnd: row.plannedEnd,
            plannedStaffId: row.plannedStaffId || undefined,
            workAsAdmin: row.workAsAdmin,
          })),
          taskRows: filledTaskRows.map((row) => ({
            weekdays: row.weekdays,
            description: row.description.trim(),
          })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");

      const parts: string[] = [];
      if (d.created) parts.push(`создано ${d.created}`);
      if (d.replaced) parts.push(`обновлено ${d.replaced}`);
      if (d.skipped) parts.push(`пропущено ${d.skipped}`);
      if (d.errors?.length) parts.push(`ошибок ${d.errors.length}`);
      if (d.tasksCreated) parts.push(`заданий ${d.tasksCreated}`);
      if (d.tasksSkipped) parts.push(`заданий пропущено ${d.tasksSkipped}`);

      onDone(
        parts.length > 0
          ? `График заполнен: ${parts.join(", ")}`
          : "Изменений не было",
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/40 p-4 admin-desktop:items-center admin-desktop:justify-center">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-slate-900">Быстрое заполнение графика</h3>
              <p className="mt-0.5 text-xs text-slate-500 capitalize">
                {monthLabel} · назначьте сотрудников по дням недели
              </p>
            </div>
            <button type="button" className="text-slate-500" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <DatePickerField
              label="Период с"
              value={dateFrom}
              min={bounds.from}
              max={bounds.to}
              onChange={setDateFrom}
              className={inputClass}
              labelClassName="mb-1 block text-xs text-slate-500"
            />
            <DatePickerField
              label="Период по"
              value={dateTo}
              min={bounds.from}
              max={bounds.to}
              onChange={setDateTo}
              className={inputClass}
              labelClassName="mb-1 block text-xs text-slate-500"
            />
          </div>

          <div className="space-y-3">
            {rows.map((row, index) => {
              const member = members.find((m) => m.memberId === row.memberId);
              const isOperator = member?.role === BRANCH_OPERATOR_ROLE;
              return (
                <div
                  key={row.key}
                  className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-600">
                      Строка {index + 1}
                    </span>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => removeRow(row.key)}
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                  <select
                    className={inputClass}
                    value={row.memberId}
                    onChange={(e) =>
                      updateRow(row.key, {
                        memberId: e.target.value,
                        workAsAdmin: false,
                        plannedStaffId: "",
                      })
                    }
                  >
                    <option value="">Сотрудник</option>
                    {members.map((m) => (
                      <option key={m.memberId} value={m.memberId}>
                        {m.name}
                        {m.role === "branch_admin" ? " (админ)" : ""}
                      </option>
                    ))}
                  </select>
                  <div>
                    <span className="mb-1.5 block text-xs text-slate-500">Дни недели</span>
                    <WeekdayPicker
                      compact
                      value={row.weekdays}
                      onChange={(weekdays) => updateRow(row.key, { weekdays })}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="time"
                      className={inputClass}
                      value={row.plannedStart}
                      onChange={(e) =>
                        updateRow(row.key, { plannedStart: e.target.value })
                      }
                    />
                    <input
                      type="time"
                      className={inputClass}
                      value={row.plannedEnd}
                      onChange={(e) =>
                        updateRow(row.key, { plannedEnd: e.target.value })
                      }
                    />
                  </div>
                  {isOperator && (
                    <>
                      <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={row.workAsAdmin}
                          onChange={(e) =>
                            updateRow(row.key, {
                              workAsAdmin: e.target.checked,
                            })
                          }
                        />
                        <span>
                          Работает как админ
                          <span className="block text-xs text-slate-500">
                            Тарифы оператора; в этот день — правка журнала и назначение операторов
                          </span>
                        </span>
                      </label>
                      <select
                        className={inputClass}
                        value={row.plannedStaffId}
                        onChange={(e) =>
                          updateRow(row.key, { plannedStaffId: e.target.value })
                        }
                      >
                        <option value="">Реверс</option>
                        {reverses.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-600 hover:border-lime-500 hover:text-lime-800"
            onClick={addRow}
          >
            + Ещё сотрудник
          </button>

          <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">
                Базовые задания на смену
              </h4>
              <p className="mt-0.5 text-xs text-slate-500">
                Чеклист без тарифа — только описание. Можно задать заранее, без
                назначенных смен
              </p>
            </div>

            {taskRows.length === 0 ? (
              <button
                type="button"
                className="w-full rounded-lg border border-dashed border-violet-300 py-2 text-sm text-violet-800 hover:bg-white"
                onClick={addTaskRow}
              >
                + Добавить задание
              </button>
            ) : (
              <div className="space-y-3">
                {taskRows.map((row, index) => (
                  <div
                    key={row.key}
                    className="rounded-lg border border-violet-100 bg-white p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-600">
                        Задание {index + 1}
                      </span>
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => removeTaskRow(row.key)}
                      >
                        Удалить
                      </button>
                    </div>
                    <input
                      className={inputClass}
                      placeholder="Описание задания"
                      value={row.description}
                      onChange={(e) =>
                        updateTaskRow(row.key, { description: e.target.value })
                      }
                    />
                    <div>
                      <span className="mb-1.5 block text-xs text-slate-500">
                        Дни недели
                      </span>
                      <WeekdayPicker
                        compact
                        value={row.weekdays}
                        onChange={(weekdays) =>
                          updateTaskRow(row.key, { weekdays })
                        }
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="w-full rounded-lg border border-dashed border-violet-300 py-2 text-sm text-violet-800 hover:bg-white"
                  onClick={addTaskRow}
                >
                  + Ещё задание
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={skipExisting}
                onChange={(e) => {
                  setSkipExisting(e.target.checked);
                  if (e.target.checked) setReplaceScheduled(false);
                }}
              />
              <span>
                Пропускать дни, где смена уже запланирована
                <span className="block text-xs text-slate-500">
                  Не трогать существующие записи «По графику»
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={replaceScheduled}
                disabled={skipExisting}
                onChange={(e) => setReplaceScheduled(e.target.checked)}
              />
              <span className={skipExisting ? "text-slate-400" : ""}>
                Обновлять уже запланированные смены
                <span className="block text-xs text-slate-500">
                  Перезаписать время и реверс у смен со статусом «По графику»
                </span>
              </span>
            </label>
          </div>

          {previewCount > 0 && (
            <p className="text-sm text-slate-600">
              Будет обработано до{" "}
              <span className="font-medium">{previewCount}</span>{" "}
              {previewCount === 1 ? "дня" : previewCount < 5 ? "дней" : "дней"}{" "}
              смен
            </p>
          )}
          {previewTaskCount > 0 && (
            <p className="text-sm text-violet-800">
              Общих заданий: до{" "}
              <span className="font-medium">{previewTaskCount}</span>
            </p>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className={`${btnPrimary} flex-1`}
            disabled={saving || (previewCount === 0 && previewTaskCount === 0)}
            onClick={() => void submit()}
          >
            {saving ? "Заполнение…" : "Заполнить график"}
          </button>
        </div>
      </div>
    </div>
  );
}
