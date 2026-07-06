"use client";

import { useCallback, useEffect, useState } from "react";
import { DatePickerField } from "@/components/admin/DatePickerField";
import { formatDateKeyRu } from "@/lib/time";
import type { BranchHolidayRow, BranchWeekdayScheduleRow } from "@/lib/branch-hours";

const WEEKDAYS = [
  { n: 1, label: "Понедельник" },
  { n: 2, label: "Вторник" },
  { n: 3, label: "Среда" },
  { n: 4, label: "Четверг" },
  { n: 5, label: "Пятница" },
  { n: 6, label: "Суббота" },
  { n: 7, label: "Воскресенье" },
];

const inputClass =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

type Props = {
  branchId: string;
};

export function BranchHoursEditor({ branchId }: Props) {
  const [schedules, setSchedules] = useState<BranchWeekdayScheduleRow[]>([]);
  const [holidays, setHolidays] = useState<BranchHolidayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayLabel, setHolidayLabel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/branches/${branchId}/hours`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка загрузки");
      setSchedules(d.weekdaySchedules ?? []);
      setHolidays(d.holidays ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateSchedule(weekday: number, patch: Partial<BranchWeekdayScheduleRow>) {
    setSchedules((prev) =>
      prev.map((row) => (row.weekday === weekday ? { ...row, ...patch } : row)),
    );
  }

  async function saveSchedules() {
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const r = await fetch(`/api/admin/branches/${branchId}/hours`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekdaySchedules: schedules, syncStaff: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка сохранения");
      setSchedules(d.weekdaySchedules ?? schedules);
      setMsg("Сохранено. График применён ко всем реверсам, сапам и ресурсам.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function addHoliday() {
    if (!holidayDate) {
      setError("Выберите дату");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/branches/${branchId}/hours`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holiday: {
            date: holidayDate,
            label: holidayLabel.trim() || null,
            isWorking: true,
          },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      setHolidays(d.holidays ?? []);
      setHolidayDate("");
      setHolidayLabel("");
      setMsg("Праздничный день добавлен — к нему применятся праздничные тарифы.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function removeHoliday(date: string) {
    if (!window.confirm(`Убрать праздник ${formatDateKeyRu(date)}?`)) return;
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/branches/${branchId}/hours`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteHolidayDate: date }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      setHolidays(d.holidays ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Загрузка часов работы…</p>;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">Часы работы филиала</h2>
      <p className="mt-1 text-xs text-slate-500">
        График по дням недели применяется ко всем реверсам, сапам и другим ресурсам при
        добавлении и при сохранении. Праздничные дни используют тарифы с меткой «Празд.» в
        услугах.
      </p>

      <div className="mt-4 space-y-2">
        {WEEKDAYS.map((w) => {
          const row = schedules.find((s) => s.weekday === w.n);
          if (!row) return null;
          return (
            <div
              key={w.n}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2"
            >
              <label className="flex min-w-[7rem] items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={row.isWorking}
                  onChange={(e) =>
                    updateSchedule(w.n, { isWorking: e.target.checked })
                  }
                />
                {w.label}
              </label>
              {row.isWorking && (
                <>
                  <input
                    type="time"
                    className={inputClass}
                    value={row.timeFrom}
                    onChange={(e) =>
                      updateSchedule(w.n, { timeFrom: e.target.value })
                    }
                  />
                  <span className="text-slate-400">—</span>
                  <input
                    type="time"
                    className={inputClass}
                    value={row.timeTo}
                    onChange={(e) =>
                      updateSchedule(w.n, { timeTo: e.target.value })
                    }
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() => void saveSchedules()}
        className="mt-4 rounded-lg bg-lime-600 px-4 py-2 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50"
      >
        {saving ? "Сохранение…" : "Сохранить часы работы"}
      </button>

      <div className="mt-8 border-t border-slate-100 pt-6">
        <h3 className="text-sm font-semibold text-slate-900">Праздничные дни</h3>
        <p className="mt-1 text-xs text-slate-500">
          Будний день, попавший на праздник, можно отметить здесь — для записей и тарифов
          он считается праздничным.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Дата</span>
            <DatePickerField
              value={holidayDate}
              onChange={setHolidayDate}
              className={inputClass}
            />
          </label>
          <label className="block min-w-[10rem] flex-1">
            <span className="mb-1 block text-xs text-slate-500">
              Название (необязательно)
            </span>
            <input
              className={`${inputClass} w-full`}
              value={holidayLabel}
              onChange={(e) => setHolidayLabel(e.target.value)}
              placeholder="Например: День независимости"
            />
          </label>
          <button
            type="button"
            disabled={saving || !holidayDate}
            onClick={() => void addHoliday()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Добавить
          </button>
        </div>

        {holidays.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {holidays.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{formatDateKeyRu(h.date)}</span>
                  {h.label ? (
                    <span className="text-slate-600"> · {h.label}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => void removeHoliday(h.date)}
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Праздники не заданы</p>
        )}
      </div>

      {msg && <p className="mt-3 text-sm text-lime-800">{msg}</p>}
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
    </section>
  );
}
