"use client";

import { useCallback, useEffect, useState } from "react";
import { ShiftReportCard, type ShiftData } from "./ShiftReportCard";
import { SPOT_CATEGORIES } from "@/lib/payroll/spot-categories";
import { formatDurationMinutes } from "@/lib/payroll/shift-summary";

const btn = "rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50";
const btnPrimary = `${btn} bg-slate-900 text-white`;
const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-800`;
const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

const STATUS_LABEL: Record<string, string> = {
  open: "Не закрыта",
  closed: "На проверке",
  approved: "Утверждена",
};

function currentMinskTime() {
  return new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Minsk",
  });
}

type Props = {
  onGoToday?: () => void;
};

export function MyShiftsPanel({ onGoToday }: Props) {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitComment, setSubmitComment] = useState("");
  const [workOpen, setWorkOpen] = useState(false);
  const [workComment, setWorkComment] = useState("");
  const [workFrom, setWorkFrom] = useState(currentMinskTime);
  const [workDurationMins, setWorkDurationMins] = useState(30);
  const [workCategory, setWorkCategory] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ from, to, mine: "1" });
      const r = await fetch(`/api/admin/work-shifts?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      const list = (d.shifts ?? []) as ShiftData[];
      setShifts(list);
      setSelectedId((prev) => prev ?? list[0]?.shift.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = shifts.find((s) => s.shift.id === selectedId) ?? null;
  const pendingCount = shifts.filter(
    (s) => s.shift.status === "closed" && !s.shift.employeeSubmittedAt,
  ).length;

  async function employeeSubmit() {
    if (!selected) return;
    const r = await fetch(`/api/admin/work-shifts/${selected.shift.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "employee_submit",
        employeeSubmitComment: submitComment.trim() || undefined,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    setSubmitComment("");
    await load();
    setSelectedId(d.shift.id);
  }

  async function addWork() {
    if (!selected || selected.shift.status !== "closed") return;
    const timeTo = addMinutes(workFrom, workDurationMins);
    const r = await fetch(`/api/admin/work-shifts/${selected.shift.id}/spot-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timeFrom: workFrom,
        timeTo,
        comment: workComment.trim() || "Доп. работа",
        category: workCategory || undefined,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    setWorkOpen(false);
    setWorkComment("");
    await load();
  }

  function addMinutes(time: string, mins: number) {
    const [h, m] = time.split(":").map(Number);
    const total = h * 60 + m + mins;
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="button" className={btnPrimary} onClick={() => void load()}>
          Показать
        </button>
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
            {pendingCount} без подтверждения
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Загрузка…</p>}

      {!loading && shifts.length === 0 && (
        <p className="text-sm text-slate-500">Смен за период нет</p>
      )}

      {shifts.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <ul className="space-y-1">
            {shifts.map((s) => (
              <li key={s.shift.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.shift.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    selectedId === s.shift.id
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{s.shift.date}</span>
                    <span className="text-slate-500">
                      {STATUS_LABEL[s.shift.status] ?? s.shift.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {s.summary.totalAmount.toFixed(2)} BYN
                    {s.shift.status === "closed" && !s.shift.employeeSubmittedAt
                      ? " · подтвердите"
                      : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {selected && (
            <div className="space-y-3">
              <ShiftReportCard data={selected} />
              {selected.summary.inServiceCount ? (
                <p className="text-xs text-amber-700">
                  В работе: {selected.summary.inServiceCount} катан.
                  {selected.summary.inServicePanelMinutes
                    ? ` (${formatDurationMinutes(selected.summary.inServicePanelMinutes)} — не в пульт)`
                    : ""}
                </p>
              ) : null}
              {selected.shift.status === "closed" && (
                <>
                  {(selected.checklistItems?.length ?? 0) > 0 && (
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                      <p className="mb-1 text-xs font-medium text-slate-600">Чеклист</p>
                      <ul className="space-y-1">
                        {selected.checklistItems!.map((item) => (
                          <li key={item.id} className="text-slate-700">
                            {item.completed ? "✓" : "○"} {item.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button type="button" className={btnSecondary} onClick={() => setWorkOpen(true)}>
                    + Добавить работу
                  </button>
                  <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                    <p className="text-xs text-slate-600">
                      Спот засчитается после утверждения администратором
                    </p>
                    <textarea
                      className={inputClass}
                      rows={2}
                      placeholder="Комментарий (если что-то добавили)"
                      value={submitComment}
                      onChange={(e) => setSubmitComment(e.target.value)}
                    />
                    <button type="button" className={btnPrimary} onClick={() => void employeeSubmit()}>
                      {selected.shift.employeeSubmittedAt
                        ? "Обновить подтверждение"
                        : "Всё верно — на проверку"}
                    </button>
                  </div>
                </>
              )}
              {selected.shift.status === "open" && onGoToday && (
                <button type="button" className={btnSecondary} onClick={onGoToday}>
                  Перейти к смене
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {workOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl bg-white p-4 space-y-3">
            <h3 className="font-semibold">Добавить работу</h3>
            <select className={inputClass} value={workCategory} onChange={(e) => setWorkCategory(e.target.value)}>
              <option value="">Категория</option>
              {SPOT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input type="time" className={inputClass} value={workFrom} onChange={(e) => setWorkFrom(e.target.value)} />
            <input
              type="number"
              className={inputClass}
              min={5}
              step={5}
              value={workDurationMins}
              onChange={(e) => setWorkDurationMins(Number(e.target.value))}
            />
            <textarea className={inputClass} rows={2} value={workComment} onChange={(e) => setWorkComment(e.target.value)} />
            <div className="flex gap-2">
              <button type="button" className={btnPrimary} onClick={() => void addWork()}>
                Сохранить
              </button>
              <button type="button" className={btnSecondary} onClick={() => setWorkOpen(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
