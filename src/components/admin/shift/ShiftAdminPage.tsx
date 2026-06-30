"use client";

import { useCallback, useEffect, useState } from "react";
import { SPOT_CATEGORIES } from "@/lib/payroll/spot-categories";
import { spotTaskStatusLabel } from "@/lib/payroll/spot-task-status";
import { ShiftReportCard, type ShiftData } from "./ShiftReportCard";
import { ShiftCalendar } from "./ShiftCalendar";
import { ShiftTomorrowBanner } from "./ShiftTomorrowBanner";

type AdminRole = "super_admin" | "branch_admin" | "branch_operator";
const BRANCH_OPERATOR_ROLE = "branch_operator";
const SUPER_ADMIN_ROLE = "super_admin";

type Tab = "today" | "calendar" | "report";

type SpotTask = {
  id: string;
  assigneeMemberId: string;
  assigneeName: string;
  description: string;
  category: string | null;
  plannedLabel: string | null;
  status: string;
  date: string;
};

type Props = {
  role: AdminRole;
  branchId: string | null;
  memberId: string;
  tasksOnly?: boolean;
};

const btn =
  "rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50";
const btnPrimary = `${btn} bg-slate-900 text-white`;
const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-800`;
const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export function ShiftAdminPage({ role, branchId, memberId, tasksOnly = false }: Props) {
  const isOperator = role === BRANCH_OPERATOR_ROLE;
  const isSuperAdmin = role === SUPER_ADMIN_ROLE;
  const canEditCalendar = isSuperAdmin;
  const canRequestChanges = !isSuperAdmin;

  const [tab, setTab] = useState<Tab>(tasksOnly ? "calendar" : "today");
  const [data, setData] = useState<ShiftData | null>(null);
  const [tasks, setTasks] = useState<SpotTask[]>([]);
  const [reverses, setReverses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedReverse, setSelectedReverse] = useState("");
  const [stopComment, setStopComment] = useState("");
  const [showStopModal, setShowStopModal] = useState(false);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [baselineChecked, setBaselineChecked] = useState<Set<string>>(new Set());
  const [handoffComment, setHandoffComment] = useState("");
  const [handoffTargetDate, setHandoffTargetDate] = useState<string | null>(null);
  const [showHandoff, setShowHandoff] = useState(false);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualComment, setManualComment] = useState("");
  const [manualFrom, setManualFrom] = useState("12:00");
  const [manualTo, setManualTo] = useState("13:00");
  const [manualCategory, setManualCategory] = useState("");
  const [manualTaskId, setManualTaskId] = useState<string | null>(null);
  const [useDurationOnly, setUseDurationOnly] = useState(false);
  const [durationMins, setDurationMins] = useState(60);

  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [reportTo, setReportTo] = useState(new Date().toISOString().slice(0, 10));
  const [periodReport, setPeriodReport] = useState<{
    shifts: {
      date: string;
      status: string;
      totalAmount: number;
      panelMinutes: number;
      spotMinutes: number;
      idleMinutes: number;
    }[];
    totals: {
      amount: number;
      panelMinutes: number;
      spotMinutes: number;
      idleMinutes: number;
    };
  } | null>(null);

  const loadShift = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin/work-shifts");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      setData(d.today ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadResources = useCallback(async () => {
    if (!branchId) return;
    const r = await fetch(`/api/admin/shift-resources?branchId=${branchId}`);
    const d = await r.json();
    if (r.ok) setReverses(d.reverses ?? []);
  }, [branchId]);

  const loadTasks = useCallback(async () => {
    const dateForTasks = data?.shift?.date;
    if (!dateForTasks) return;
    const q = new URLSearchParams({ date: dateForTasks, mine: "1" });
    const r = await fetch(`/api/admin/spot-tasks?${q}`);
    const d = await r.json();
    if (r.ok) setTasks(d.tasks ?? []);
  }, [data?.shift?.date]);

  useEffect(() => {
    loadShift();
    loadResources();
  }, [loadShift, loadResources]);

  useEffect(() => {
    if (tab === "today" && data?.shift?.status === "open") {
      loadTasks();
    }
  }, [tab, loadTasks, data?.shift?.status]);

  useEffect(() => {
    if (!data?.shift || data.shift.status !== "open") {
      setShowHandoff(false);
      return;
    }
    const completed = new Set(
      (data.baselineTasks ?? []).filter((t) => t.completed).map((t) => t.id),
    );
    setBaselineChecked(completed);

    const q = new URLSearchParams({
      workShiftId: data.shift.id,
      shiftDate: data.shift.date,
      branchId: data.shift.branchId,
    });
    void fetch(`/api/admin/shift-handoff?${q}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) return;
        if (d.needsHandoff) {
          setHandoffTargetDate(d.targetDate);
          setHandoffComment(d.existingComment ?? "");
          setShowHandoff(!d.existingComment);
        } else {
          setShowHandoff(false);
        }
      })
      .catch(() => undefined);
  }, [data?.shift?.id, data?.shift?.status, data?.baselineTasks]);

  async function startShift() {
    const r = await fetch("/api/admin/work-shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        handoffComment.trim() && handoffTargetDate
          ? { handoffComment: handoffComment.trim() }
          : {},
      ),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    setData(d);
    setShowHandoff(false);
  }

  async function saveHandoff() {
    if (!data?.shift || !handoffTargetDate || !handoffComment.trim()) return;
    const r = await fetch("/api/admin/shift-handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workShiftId: data.shift.id,
        targetDate: handoffTargetDate,
        comment: handoffComment.trim(),
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    setShowHandoff(false);
  }

  async function closeShift() {
    if (!data) return;
    const r = await fetch(`/api/admin/work-shifts/${data.shift.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "close",
        baselineCompletedTaskIds: [...baselineChecked],
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    setData(d);
  }

  async function assignReverse() {
    if (!data || !selectedReverse) return;
    const r = await fetch(`/api/admin/work-shifts/${data.shift.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign_reverse", staffId: selectedReverse }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    setData(d);
  }

  async function startSpotTimer(taskId?: string) {
    if (!data) return;
    const r = await fetch(
      `/api/admin/work-shifts/${data.shift.id}/spot-entries?action=start`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      },
    );
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    setData(d);
    loadTasks();
  }

  async function stopSpotTimer() {
    if (!data || !activeEntryId || !stopComment.trim()) return;
    const r = await fetch(
      `/api/admin/work-shifts/${data.shift.id}/spot-entries/${activeEntryId}/stop`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: stopComment.trim() }),
      },
    );
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    setShowStopModal(false);
    setStopComment("");
    setActiveEntryId(null);
    setData(d);
    loadTasks();
  }

  async function saveManualSpot() {
    if (!data || !manualComment.trim()) return;
    const body: Record<string, unknown> = {
      comment: manualComment.trim(),
      category: manualCategory || undefined,
      taskId: manualTaskId || undefined,
    };
    if (useDurationOnly) {
      const [h, m] = manualFrom.split(":").map(Number);
      const startMins = h * 60 + m;
      const endMins = startMins + durationMins;
      const endH = Math.floor(endMins / 60);
      const endM = endMins % 60;
      body.timeFrom = manualFrom;
      body.timeTo = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    } else {
      body.timeFrom = manualFrom;
      body.timeTo = manualTo;
    }
    const r = await fetch(`/api/admin/work-shifts/${data.shift.id}/spot-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    setManualOpen(false);
    setManualComment("");
    setManualTaskId(null);
    setData(d);
    loadTasks();
  }

  async function deleteSpotEntry(entryId: string) {
    if (!data) return;
    const reason = window.prompt("Причина удаления:");
    if (!reason?.trim()) return;
    const r = await fetch(
      `/api/admin/work-shifts/${data.shift.id}/spot-entries?entryId=${entryId}&comment=${encodeURIComponent(reason)}`,
      { method: "DELETE" },
    );
    const d = await r.json();
    if (r.ok) setData(d);
  }

  function openCompleteTask(task: SpotTask) {
    setManualTaskId(task.id);
    setManualComment(task.description);
    setManualOpen(true);
  }

  async function loadPeriodReport() {
    const r = await fetch(
      `/api/admin/work-shifts?from=${reportFrom}&to=${reportTo}`,
    );
    const d = await r.json();
    if (r.ok) setPeriodReport(d);
  }

  const activeSpot = data?.spotEntries.find((e) => e.isActive);
  const activeAssign = data?.reverseAssignments.find((a) => !a.endedAt);
  const shiftOpen = data?.shift.status === "open";
  const isOpRole = data?.summary.isOperator ?? isOperator;

  useEffect(() => {
    if (activeSpot) setActiveEntryId(activeSpot.id);
  }, [activeSpot]);

  const tabs: { id: Tab; label: string }[] = [
    ...(!tasksOnly ? [{ id: "today" as Tab, label: "Сегодня" }] : []),
    { id: "calendar" as Tab, label: "Календарь" },
    ...(!tasksOnly ? [{ id: "report" as Tab, label: "Мой отчёт" }] : []),
  ];

  return (
    <div
      className={`mx-auto p-4 ${
        tab === "calendar"
          ? "max-w-lg admin-desktop:max-w-5xl"
          : "max-w-lg admin-desktop:max-w-2xl"
      }`}
    >
      <h1 className="mb-4 text-xl font-bold text-slate-900">
        {tasksOnly ? "Календарь смен" : "Учёт времени"}
      </h1>

      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md py-2 text-sm font-medium ${
              tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {tab === "today" && (
        <div className="space-y-4">
          {!tasksOnly && <ShiftTomorrowBanner />}
          {loading && <p className="text-sm text-slate-500">Загрузка…</p>}

          {!loading && !data && (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
              <p className="mb-3 text-sm text-slate-600">Смена не открыта</p>
              <button type="button" className={btnPrimary} onClick={startShift}>
                Начать смену
              </button>
            </div>
          )}

          {data && (
            <>
              {data.shift.plannedStart && data.shift.plannedEnd && (
                <p className="text-xs text-slate-500">
                  График филиала: {data.shift.plannedStart}–{data.shift.plannedEnd}
                </p>
              )}

              {shiftOpen ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <p className="text-sm font-medium text-green-700">Смена идёт</p>

                  {isOpRole && (
                    <>
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">Реверс</label>
                        <div className="flex gap-2">
                          <select
                            className={inputClass}
                            value={selectedReverse}
                            onChange={(e) => setSelectedReverse(e.target.value)}
                          >
                            <option value="">Выберите…</option>
                            {reverses.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className={btnSecondary}
                            disabled={!selectedReverse}
                            onClick={assignReverse}
                          >
                            OK
                          </button>
                        </div>
                        {activeAssign && (
                          <p className="mt-1 text-xs text-slate-600">
                            Сейчас: {activeAssign.staffName}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-lg bg-slate-50 p-2">
                          <p className="text-slate-500">Пульт</p>
                          <p className="font-semibold">{data.summary.lines[0]?.hoursLabel ?? "0"}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          <p className="text-slate-500">Спот</p>
                          <p className="font-semibold">
                            {data.summary.lines.find((l) => l.kind === "spot")?.hoursLabel ?? "0"}
                          </p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          <p className="text-slate-500">Простой</p>
                          <p className="font-semibold">
                            {data.summary.lines.find((l) => l.kind === "idle")?.hoursLabel ?? "0"}
                          </p>
                        </div>
                      </div>

                      {tasks.filter((t) => t.status === "pending" || t.status === "in_progress").length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-medium text-slate-700">Задания</p>
                          {tasks
                            .filter((t) => t.status === "pending" || t.status === "in_progress")
                            .map((t) => (
                              <div
                                key={t.id}
                                className="mb-2 rounded-lg border border-slate-100 p-2 text-sm"
                              >
                                <p>{t.description}</p>
                                <p className="text-xs text-slate-500">
                                  {t.plannedLabel} · {spotTaskStatusLabel(t.status)}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className={btnSecondary}
                                    disabled={!!activeSpot}
                                    onClick={() => startSpotTimer(t.id)}
                                  >
                                    Начать
                                  </button>
                                  <button
                                    type="button"
                                    className={btnSecondary}
                                    disabled={!!activeSpot}
                                    onClick={() => openCompleteTask(t)}
                                  >
                                    Выполнено
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}

                      <div>
                        <p className="mb-2 text-xs font-medium text-slate-700">Работа на споте</p>
                        {activeSpot ? (
                          <div className="rounded-lg bg-amber-50 p-3">
                            <p className="text-sm">Идёт работа на споте…</p>
                            <button
                              type="button"
                              className={`${btnPrimary} mt-2`}
                              onClick={() => {
                                setActiveEntryId(activeSpot.id);
                                setShowStopModal(true);
                              }}
                            >
                              Завершить
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={btnSecondary}
                              onClick={() => startSpotTimer()}
                            >
                              Начать спот
                            </button>
                            <button
                              type="button"
                              className={btnSecondary}
                              onClick={() => setManualOpen(true)}
                            >
                              + Добавить
                            </button>
                          </div>
                        )}
                      </div>

                      {data.spotEntries.filter((e) => !e.isActive && e.endedAt).length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-slate-700">Спот за день</p>
                          {data.spotEntries
                            .filter((e) => !e.isActive && e.endedAt)
                            .map((e) => (
                              <div
                                key={e.id}
                                className="mb-1 flex items-start justify-between rounded border border-slate-100 p-2 text-xs"
                              >
                                <span>
                                  {new Date(e.startedAt).toLocaleTimeString("ru-RU", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                  –
                                  {new Date(e.endedAt!).toLocaleTimeString("ru-RU", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                  : {e.comment}
                                </span>
                                {shiftOpen && (
                                  <button
                                    type="button"
                                    className="text-red-600"
                                    onClick={() => deleteSpotEntry(e.id)}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                    </>
                  )}

                  {!isOpRole && (
                    <p className="text-sm text-slate-600">
                      Часы смены: {data.summary.lines[0]?.hoursLabel ?? "0"}
                    </p>
                  )}

                  {showHandoff && handoffTargetDate && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                      <p className="text-sm font-medium text-amber-900">
                        Состояние спота после смены {handoffTargetDate}
                      </p>
                      <p className="text-xs text-amber-800">
                        Оставьте комментарий в начале своей смены — его увидит
                        супер-админ
                      </p>
                      <textarea
                        className={inputClass}
                        rows={3}
                        value={handoffComment}
                        onChange={(e) => setHandoffComment(e.target.value)}
                        placeholder="Например: спот чистый, кофеаппарат промыт…"
                      />
                      <button
                        type="button"
                        className={btnPrimary}
                        disabled={!handoffComment.trim()}
                        onClick={() => void saveHandoff()}
                      >
                        Сохранить комментарий
                      </button>
                    </div>
                  )}

                  {(data.baselineTasks?.length ?? 0) > 0 && (
                    <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-3">
                      <p className="mb-2 text-xs font-medium text-violet-900">
                        Базовые задания смены
                      </p>
                      <ul className="space-y-2">
                        {data.baselineTasks!.map((t) => (
                          <li key={t.id}>
                            <label className="flex items-start gap-2 text-sm text-slate-800">
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={baselineChecked.has(t.id)}
                                onChange={(e) => {
                                  setBaselineChecked((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(t.id);
                                    else next.delete(t.id);
                                    return next;
                                  });
                                }}
                              />
                              <span>{t.description}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-violet-700">
                        Отметьте выполненное перед закрытием смены
                      </p>
                    </div>
                  )}

                  <button type="button" className={`${btnPrimary} w-full`} onClick={closeShift}>
                    Завершить смену
                  </button>
                </div>
              ) : (
                <ShiftReportCard data={data} />
              )}
            </>
          )}
        </div>
      )}

      {tab === "calendar" && (
        <ShiftCalendar
          role={role}
          branchId={branchId}
          memberId={memberId}
          canEdit={canEditCalendar}
          canRequestChanges={canRequestChanges}
        />
      )}

      {tab === "report" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input type="date" className={inputClass} value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} />
            <input type="date" className={inputClass} value={reportTo} onChange={(e) => setReportTo(e.target.value)} />
            <button type="button" className={btnPrimary} onClick={loadPeriodReport}>
              Показать
            </button>
          </div>
          {periodReport && (
            <>
              <p className="text-lg font-bold">
                Итого: {periodReport.totals.amount.toFixed(2)} BYN
              </p>
              <p className="text-xs text-slate-500">
                Пульт {Math.round(periodReport.totals.panelMinutes / 60)}ч · Спот{" "}
                {Math.round(periodReport.totals.spotMinutes / 60)}ч · Простой{" "}
                {Math.round(periodReport.totals.idleMinutes / 60)}ч
              </p>
              {periodReport.shifts.map((s) => (
                <div key={s.date} className="flex justify-between rounded-lg border p-2 text-sm">
                  <span>
                    {s.date} ({s.status})
                  </span>
                  <span>{s.totalAmount.toFixed(2)} BYN</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {showStopModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4">
          <div className="w-full rounded-xl bg-white p-4 space-y-3">
            <h3 className="font-semibold">Что сделано?</h3>
            <textarea
              className={inputClass}
              rows={3}
              value={stopComment}
              onChange={(e) => setStopComment(e.target.value)}
            />
            <button
              type="button"
              className={`${btnPrimary} w-full`}
              disabled={!stopComment.trim()}
              onClick={stopSpotTimer}
            >
              Сохранить
            </button>
          </div>
        </div>
      )}

      {manualOpen && data && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4">
          <div className="w-full rounded-xl bg-white p-4 space-y-3">
            <h3 className="font-semibold">Добавить работу</h3>
            <div className="flex gap-2 text-xs">
              {[30, 60, 90].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={btnSecondary}
                  onClick={() => {
                    setUseDurationOnly(true);
                    setDurationMins(m);
                  }}
                >
                  {m} мин
                </button>
              ))}
              <button
                type="button"
                className={btnSecondary}
                onClick={() => setUseDurationOnly(false)}
              >
                С–По
              </button>
            </div>
            {useDurationOnly ? (
              <div className="flex gap-2">
                <input
                  type="time"
                  className={inputClass}
                  value={manualFrom}
                  onChange={(e) => setManualFrom(e.target.value)}
                />
                <input
                  type="number"
                  className={inputClass}
                  value={durationMins}
                  onChange={(e) => setDurationMins(Number(e.target.value))}
                  placeholder="Мин"
                />
              </div>
            ) : (
              <div className="flex gap-2">
                <input type="time" className={inputClass} value={manualFrom} onChange={(e) => setManualFrom(e.target.value)} />
                <input type="time" className={inputClass} value={manualTo} onChange={(e) => setManualTo(e.target.value)} />
              </div>
            )}
            <select className={inputClass} value={manualCategory} onChange={(e) => setManualCategory(e.target.value)}>
              <option value="">Категория</option>
              {SPOT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <textarea
              className={inputClass}
              rows={2}
              placeholder="Что сделано"
              value={manualComment}
              onChange={(e) => setManualComment(e.target.value)}
            />
            <button type="button" className={`${btnPrimary} w-full`} onClick={saveManualSpot}>
              Сохранить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
