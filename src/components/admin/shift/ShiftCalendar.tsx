"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SPOT_CATEGORIES } from "@/lib/payroll/spot-categories";
import {
  SPOT_TASK_STATUSES,
  spotTaskStatusClass,
  spotTaskStatusLabel,
  workShiftStatusClass,
  workShiftStatusLabel,
} from "@/lib/payroll/spot-task-status";

import { ShiftMyScheduleList } from "./ShiftMyScheduleList";
import { ShiftChangeRequestsPanel } from "./ShiftChangeRequestsPanel";
import { ShiftBulkFillModal } from "./ShiftBulkFillModal";

type CalendarView = "grid" | "mine" | "requests";
type ScheduleFilter = "branch" | "mine";
type AdminRole = "super_admin" | "branch_admin" | "branch_operator";
const SUPER_ADMIN_ROLE = "super_admin";

type CalendarShift = {
  id: string;
  memberId: string;
  memberName: string;
  status: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedStaffId: string | null;
  plannedStaffName: string | null;
  workAsAdmin: boolean;
  branchName?: string;
};

type CalendarTask = {
  id: string;
  assigneeMemberId: string;
  assigneeName: string;
  description: string;
  category: string | null;
  plannedMinutes: number | null;
  plannedTimeFrom: string | null;
  plannedTimeTo: string | null;
  plannedLabel: string | null;
  status: string;
  branchName?: string;
  branchWide?: boolean;
  groupId?: string | null;
  totalPlannedMinutes?: number | null;
  workerCount?: number;
};

type BaselineTask = {
  id: string;
  description: string;
  branchName?: string;
};

type DayData = {
  date: string;
  shifts: CalendarShift[];
  tasks: CalendarTask[];
  baselineTasks: BaselineTask[];
};

type CalendarResponse = {
  month: string;
  canEdit: boolean;
  branchId: string | null;
  viewerMemberId: string;
  days: DayData[];
};

type Operator = { memberId: string; name: string };
type Member = { memberId: string; name: string; role: string };
type Reverse = { id: string; name: string };
type Branch = { id: string; name: string };

type ShiftFormState = {
  id?: string;
  date: string;
  memberId: string;
  plannedStart: string;
  plannedEnd: string;
  plannedStaffId: string;
  workAsAdmin: boolean;
};

type TaskFormState = {
  id?: string;
  date: string;
  assigneeMemberId: string;
  description: string;
  category: string;
  timeMode: "duration" | "window";
  plannedMinutes: number;
  plannedTimeFrom: string;
  plannedTimeTo: string;
  status: string;
};

type BaselineFormState = {
  id?: string;
  date: string;
  description: string;
};

type Props = {
  role: AdminRole;
  branchId: string | null;
  memberId: string;
  canEdit: boolean;
  canRequestChanges: boolean;
};

function filterDayData(day: DayData, memberId: string, mode: ScheduleFilter): DayData {
  if (mode === "branch") return day;
  const onShift = day.shifts.some((s) => s.memberId === memberId);
  return {
    date: day.date,
    shifts: day.shifts.filter((s) => s.memberId === memberId),
    tasks: day.tasks.filter((t) => t.assigneeMemberId === memberId),
    baselineTasks: onShift ? day.baselineTasks : [],
  };
}

function dayHasMine(day: DayData, memberId: string) {
  return (
    day.shifts.some((s) => s.memberId === memberId) ||
    day.tasks.some((t) => t.assigneeMemberId === memberId) ||
    (day.baselineTasks.length > 0 &&
      day.shifts.some((s) => s.memberId === memberId))
  );
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const btn =
  "rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50";
const btnPrimary = `${btn} bg-slate-900 text-white`;
const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-800`;
const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildGridCells(month: string, days: DayData[]) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  let pad = first.getDay();
  pad = pad === 0 ? 6 : pad - 1;
  const dayMap = new Map(days.map((d) => [d.date, d]));
  const last = new Date(y, m, 0).getDate();
  const cells: ({ date: string; data: DayData } | null)[] = Array(pad).fill(null);
  for (let d = 1; d <= last; d++) {
    const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date, data: dayMap.get(date) ?? { date, shifts: [], tasks: [], baselineTasks: [] } });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function emptyShiftForm(date: string): ShiftFormState {
  return {
    date,
    memberId: "",
    plannedStart: "10:00",
    plannedEnd: "22:00",
    plannedStaffId: "",
    workAsAdmin: false,
  };
}

function shiftDetailLabel(s: CalendarShift): string {
  const parts = [s.memberName];
  if (s.workAsAdmin) parts.push("как админ");
  else if (s.plannedStaffName) parts.push(s.plannedStaffName);
  if (s.plannedStart && s.plannedEnd) parts.push(`${s.plannedStart}–${s.plannedEnd}`);
  return parts.join(" · ");
}

function emptyForm(date: string, assigneeMemberId = ""): TaskFormState {
  return {
    date,
    assigneeMemberId,
    description: "",
    category: "",
    timeMode: "duration",
    plannedMinutes: 60,
    plannedTimeFrom: "14:00",
    plannedTimeTo: "15:30",
    status: "pending",
  };
}

function emptyBaselineForm(date: string): BaselineFormState {
  return { date, description: "" };
}

export function ShiftCalendar({
  role,
  branchId,
  memberId,
  canEdit,
  canRequestChanges,
}: Props) {
  const [month, setMonth] = useState(currentMonthKey);
  const [calendarView, setCalendarView] = useState<CalendarView>("grid");
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>(
    canEdit ? "branch" : "mine",
  );
  const [requestFormSeed, setRequestFormSeed] = useState<{
    date: string;
    workShiftId?: string;
  } | null>(null);
  const [calendarBranchId, setCalendarBranchId] = useState(branchId ?? "");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [reverses, setReverses] = useState<Reverse[]>([]);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [shiftForm, setShiftForm] = useState<ShiftFormState | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState | null>(null);
  const [baselineForm, setBaselineForm] = useState<BaselineFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [addTaskAfterShift, setAddTaskAfterShift] = useState(false);
  const [bulkFillOpen, setBulkFillOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const showBranchNames = role === SUPER_ADMIN_ROLE && !calendarBranchId;

  useEffect(() => {
    if (role === SUPER_ADMIN_ROLE && !branchId) {
      fetch("/api/admin/branches")
        .then((r) => r.json())
        .then((d) => {
          setBranches(d.branches ?? []);
          if (d.branches?.[0] && !calendarBranchId) {
            setCalendarBranchId(d.branches[0].id);
          }
        });
    }
  }, [role, branchId, calendarBranchId]);

  const loadBranchResources = useCallback(async (bid: string) => {
    const r = await fetch(`/api/admin/shift-resources?branchId=${bid}`);
    const d = await r.json();
    if (r.ok) {
      setOperators(d.operators ?? []);
      setMembers(d.members ?? []);
      setReverses(d.reverses ?? []);
    }
  }, []);

  useEffect(() => {
    const bid = calendarBranchId || branchId;
    if (bid) loadBranchResources(bid);
  }, [calendarBranchId, branchId, loadBranchResources]);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ month });
      const bid = calendarBranchId || branchId;
      if (bid) q.set("branchId", bid);
      const r = await fetch(`/api/admin/shift-calendar?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      setData({
        ...d,
        days: (d.days ?? []).map((day: DayData) => ({
          ...day,
          baselineTasks: day.baselineTasks ?? [],
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [month, calendarBranchId, branchId]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  const cells = useMemo(() => {
    if (!data) return [];
    const days =
      scheduleFilter === "mine"
        ? data.days.map((d) => filterDayData(d, memberId, "mine"))
        : data.days;
    return buildGridCells(month, days);
  }, [data, month, scheduleFilter, memberId]);

  const displayDays = useMemo(() => {
    if (!data) return [];
    if (scheduleFilter === "mine") {
      return data.days.map((d) => filterDayData(d, memberId, "mine"));
    }
    return data.days;
  }, [data, scheduleFilter, memberId]);

  const selectedDay = useMemo(() => {
    if (!selectedDate || !data) return null;
    const raw = data.days.find((d) => d.date === selectedDate);
    if (!raw) return null;
    if (calendarView === "mine" || scheduleFilter === "mine") {
      return filterDayData(raw, memberId, "mine");
    }
    return raw;
  }, [selectedDate, data, calendarView, scheduleFilter, memberId]);

  async function loadShiftDefaults(date: string): Promise<{ plannedStart: string; plannedEnd: string }> {
    const bid = calendarBranchId || branchId;
    if (!bid) return { plannedStart: "10:00", plannedEnd: "22:00" };
    const r = await fetch(
      `/api/admin/shift-schedule?branchId=${bid}&date=${date}`,
    );
    const d = await r.json();
    if (r.ok) return { plannedStart: d.plannedStart, plannedEnd: d.plannedEnd };
    return { plannedStart: "10:00", plannedEnd: "22:00" };
  }

  async function openCreateShift(date: string) {
    if (!canEdit) return;
    const defaults = await loadShiftDefaults(date);
    setShiftForm({ ...emptyShiftForm(date), ...defaults });
    setSelectedDate(date);
  }

  function openEditShift(shift: CalendarShift, date: string) {
    if (!canEdit || shift.status !== "scheduled") {
      setSelectedDate(date);
      return;
    }
    setShiftForm({
      id: shift.id,
      date,
      memberId: shift.memberId,
      plannedStart: shift.plannedStart ?? "10:00",
      plannedEnd: shift.plannedEnd ?? "22:00",
      plannedStaffId: shift.plannedStaffId ?? "",
      workAsAdmin: shift.workAsAdmin,
    });
    setSelectedDate(date);
  }

  async function saveShift() {
    if (!shiftForm) return;
    const bid = calendarBranchId || branchId;
    if (!bid || !shiftForm.memberId) {
      setError("Выберите сотрудника");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        branchId: bid,
        memberId: shiftForm.memberId,
        date: shiftForm.date,
        plannedStart: shiftForm.plannedStart,
        plannedEnd: shiftForm.plannedEnd,
        plannedStaffId: shiftForm.workAsAdmin ? undefined : shiftForm.plannedStaffId || undefined,
        workAsAdmin: shiftForm.workAsAdmin,
      };
      const r = shiftForm.id
        ? await fetch(`/api/admin/shift-schedule/${shiftForm.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/shift-schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");

      const savedMemberId = shiftForm.memberId;
      const savedDate = shiftForm.date;
      const shouldAddTask = addTaskAfterShift && !shiftForm.id;
      setShiftForm(null);
      setAddTaskAfterShift(false);
      await loadCalendar();

      if (shouldAddTask) {
        setTaskForm(emptyForm(savedDate, savedMemberId));
        setSelectedDate(savedDate);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function deleteShift(id: string) {
    if (!window.confirm("Убрать сотрудника из графика на этот день?")) return;
    const r = await fetch(`/api/admin/shift-schedule/${id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    setShiftForm(null);
    loadCalendar();
  }

  function openCreateTask(date: string, assigneeMemberId = "") {
    if (!canEdit) return;
    setTaskForm(emptyForm(date, assigneeMemberId));
    setBaselineForm(null);
    setSelectedDate(date);
  }

  function openBaselineForm(date: string, task?: BaselineTask) {
    if (!canEdit) return;
    setBaselineForm(
      task
        ? { id: task.id, date, description: task.description }
        : emptyBaselineForm(date),
    );
    setTaskForm(null);
    setSelectedDate(date);
  }

  function openEditTask(task: CalendarTask, date: string) {
    if (!canEdit) {
      setSelectedDate(date);
      return;
    }
    const timeMode =
      task.plannedTimeFrom && task.plannedTimeTo ? "window" : "duration";
    setTaskForm({
      id: task.id,
      date,
      assigneeMemberId: task.assigneeMemberId,
      description: task.description,
      category: task.category ?? "",
      timeMode,
      plannedMinutes: task.plannedMinutes ?? 60,
      plannedTimeFrom: task.plannedTimeFrom ?? "14:00",
      plannedTimeTo: task.plannedTimeTo ?? "15:30",
      status: task.status,
    });
    setBaselineForm(null);
    setSelectedDate(date);
  }

  async function saveBaseline() {
    if (!baselineForm) return;
    const bid = calendarBranchId || branchId;
    if (!bid || !baselineForm.description.trim()) {
      setError("Заполните описание");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const r = await fetch(
        baselineForm.id
          ? `/api/admin/shift-baseline-tasks/${baselineForm.id}`
          : "/api/admin/shift-baseline-tasks",
        {
          method: baselineForm.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchId: bid,
            date: baselineForm.date,
            description: baselineForm.description.trim(),
          }),
        },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      setBaselineForm(null);
      await loadCalendar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBaseline(id: string) {
    if (!window.confirm("Удалить базовое задание?")) return;
    const r = await fetch(`/api/admin/shift-baseline-tasks/${id}`, {
      method: "DELETE",
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    setBaselineForm(null);
    loadCalendar();
  }

  async function saveTask() {
    if (!taskForm) return;
    const bid = calendarBranchId || branchId;
    if (!bid || !taskForm.description.trim()) {
      setError("Заполните описание");
      return;
    }
    if (!taskForm.assigneeMemberId) {
      setError("Выберите сотрудника");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const timePayload =
        taskForm.timeMode === "duration"
          ? { plannedMinutes: taskForm.plannedMinutes }
          : {
              plannedTimeFrom: taskForm.plannedTimeFrom,
              plannedTimeTo: taskForm.plannedTimeTo,
            };

      if (taskForm.id) {
        const r = await fetch(`/api/admin/spot-tasks/${taskForm.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assigneeMemberId: taskForm.assigneeMemberId,
            date: taskForm.date,
            description: taskForm.description.trim(),
            category: taskForm.category || null,
            status: taskForm.status,
            ...timePayload,
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Ошибка");
      } else {
        const r = await fetch("/api/admin/spot-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchId: bid,
            assigneeMemberId: taskForm.assigneeMemberId,
            date: taskForm.date,
            description: taskForm.description.trim(),
            category: taskForm.category || undefined,
            ...timePayload,
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Ошибка");
      }
      setTaskForm(null);
      await loadCalendar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function cancelTask(id: string) {
    if (!window.confirm("Отменить задание?")) return;
    const r = await fetch(`/api/admin/spot-tasks/${id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    setTaskForm(null);
    loadCalendar();
  }

  const today = new Date().toISOString().slice(0, 10);
  const shiftFormMember = shiftForm
    ? members.find((m) => m.memberId === shiftForm.memberId)
    : null;
  const isOperatorShift = shiftFormMember?.role === "branch_operator";

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {(
          [
            { id: "grid" as CalendarView, label: "Календарь" },
            { id: "mine" as CalendarView, label: "Мои смены" },
            { id: "requests" as CalendarView, label: "Заявки" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setCalendarView(t.id)}
            className={`flex-1 rounded-md py-2 text-sm font-medium ${
              calendarView === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {calendarView === "grid" && (
      <>
      <div className="flex flex-wrap items-center gap-2">
        {role === SUPER_ADMIN_ROLE && branches.length > 0 && (
          <select
            className={inputClass}
            value={calendarBranchId}
            onChange={(e) => setCalendarBranchId(e.target.value)}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1">
          <button
            type="button"
            className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Предыдущий месяц"
          >
            ‹
          </button>
          <span className="text-sm font-medium capitalize">{monthLabel(month)}</span>
          <button
            type="button"
            className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label="Следующий месяц"
          >
            ›
          </button>
        </div>
        <button
          type="button"
          className={btnSecondary}
          onClick={() => setMonth(currentMonthKey())}
        >
          Сегодня
        </button>
        {canEdit && (calendarBranchId || branchId) && (
          <button
            type="button"
            className={btnPrimary}
            onClick={() => setBulkFillOpen(true)}
          >
            Быстрое заполнение
          </button>
        )}
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setScheduleFilter("branch")}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium ${
            scheduleFilter === "branch"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600"
          }`}
        >
          Весь филиал
        </button>
        <button
          type="button"
          onClick={() => setScheduleFilter("mine")}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium ${
            scheduleFilter === "mine"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600"
          }`}
        >
          Мой график
        </button>
      </div>

      {!canEdit && (
        <p className="text-xs text-slate-500">
          Режим просмотра. Изменения — через вкладку «Заявки».
        </p>
      )}

      {loading && <p className="text-sm text-slate-500">Загрузка…</p>}

      {!loading && data && (
        <>
          <div className="hidden admin-desktop:block overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="mb-1 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    className="text-center text-xs font-medium text-slate-500"
                  >
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((cell, i) =>
                  cell ? (
                    <DayCell
                      key={cell.date}
                      date={cell.date}
                      data={cell.data}
                      memberId={memberId}
                      highlightMine={scheduleFilter === "branch"}
                      isToday={cell.date === today}
                      canEdit={canEdit}
                      showBranchNames={showBranchNames}
                      onSelect={() => setSelectedDate(cell.date)}
                      onAddShift={() => openCreateShift(cell.date)}
                      onAddTask={() => openBaselineForm(cell.date)}
                    />
                  ) : (
                    <div key={`pad-${i}`} className="min-h-[100px]" />
                  ),
                )}
              </div>
            </div>
          </div>

          <div className="admin-desktop:hidden space-y-2">
            {displayDays
              .filter((d) => d.shifts.length > 0 || d.tasks.length > 0)
              .map((d) => (
                <button
                  key={d.date}
                  type="button"
                  className={`w-full rounded-lg border bg-white p-3 text-left ${
                    dayHasMine(d, memberId) && scheduleFilter === "branch"
                      ? "border-lime-300 ring-1 ring-lime-200"
                      : "border-slate-200"
                  }`}
                  onClick={() => setSelectedDate(d.date)}
                >
                  <p className="text-sm font-medium">
                    {new Date(d.date + "T12:00:00").toLocaleDateString("ru-RU", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                  <p className="text-xs text-slate-500">
                    Смен: {d.shifts.length} · Заданий: {d.tasks.length}
                  </p>
                </button>
              ))}
            {displayDays.every(
              (d) => d.shifts.length === 0 && d.tasks.length === 0,
            ) && (
              <p className="text-sm text-slate-500">В этом месяце пока нет записей</p>
            )}
          </div>
        </>
      )}
      </>
      )}

      {calendarView === "mine" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1">
              <button
                type="button"
                className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                ‹
              </button>
              <span className="text-sm font-medium capitalize">{monthLabel(month)}</span>
              <button
                type="button"
                className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                ›
              </button>
            </div>
          </div>
          {loading && <p className="text-sm text-slate-500">Загрузка…</p>}
          {!loading && data && (
            <ShiftMyScheduleList
              days={data.days}
              memberId={memberId}
              onRequestChange={
                canRequestChanges
                  ? (date, workShiftId) => {
                      setRequestFormSeed({ date, workShiftId });
                      setCalendarView("requests");
                    }
                  : undefined
              }
            />
          )}
        </div>
      )}

      {calendarView === "requests" && (
        <ShiftChangeRequestsPanel
          canReview={canEdit}
          canSubmit={canRequestChanges}
          branchId={calendarBranchId || branchId}
          initialForm={
            requestFormSeed
              ? {
                  date: requestFormSeed.date,
                  workShiftId: requestFormSeed.workShiftId ?? "",
                }
              : null
          }
          onFormConsumed={() => setRequestFormSeed(null)}
        />
      )}

      {successMsg && (
        <p className="rounded-lg bg-lime-50 px-3 py-2 text-sm text-lime-800">{successMsg}</p>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {selectedDate && selectedDay && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 admin-desktop:items-center admin-desktop:justify-center">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("ru-RU", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </h3>
              </div>
              <button
                type="button"
                className="text-slate-500"
                onClick={() => {
                  setSelectedDate(null);
                  setTaskForm(null);
                  setShiftForm(null);
                }}
              >
                ✕
              </button>
            </div>

            <section className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Смены
                </h4>
                {canEdit && (
                  <button
                    type="button"
                    className="text-xs font-medium text-lime-700"
                    onClick={() => openCreateShift(selectedDate)}
                  >
                    + Сотрудник
                  </button>
                )}
              </div>
              {selectedDay.shifts.length === 0 ? (
                <p className="text-sm text-slate-500">Никто не назначен</p>
              ) : (
                <ul className="space-y-2">
                  {selectedDay.shifts.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="flex w-full items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100"
                        onClick={() => openEditShift(s, selectedDate)}
                      >
                        <div>
                          <p className="font-medium">{s.memberName}</p>
                          {s.plannedStart && s.plannedEnd && (
                            <p className="text-xs text-slate-500">
                              {s.plannedStart}–{s.plannedEnd}
                            </p>
                          )}
                          {s.workAsAdmin && (
                            <p className="text-xs text-violet-600">Работает как админ</p>
                          )}
                          {!s.workAsAdmin && s.plannedStaffName && (
                            <p className="text-xs text-slate-500">Реверс: {s.plannedStaffName}</p>
                          )}
                          {canEdit && s.status === "scheduled" && !s.workAsAdmin && (
                            <span
                              role="button"
                              tabIndex={0}
                              className="mt-1 inline-block text-xs text-lime-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCreateTask(selectedDate, s.memberId);
                              }}
                            >
                              + задание
                            </span>
                          )}
                          {canRequestChanges &&
                            s.memberId === memberId &&
                            s.status === "scheduled" && (
                          <button
                            type="button"
                            className="mt-1 text-xs text-lime-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRequestFormSeed({ date: selectedDate, workShiftId: s.id });
                              setCalendarView("requests");
                              setSelectedDate(null);
                            }}
                          >
                            Заявка на изменение
                          </button>
                        )}
                        </div>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${workShiftStatusClass(s.status)}`}
                        >
                          {workShiftStatusLabel(s.status)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-600">
                  Базовые задания
                </h4>
                {canEdit && (
                  <button
                    type="button"
                    className="text-xs font-medium text-violet-700"
                    onClick={() => openBaselineForm(selectedDate)}
                  >
                    + На всех
                  </button>
                )}
              </div>
              {selectedDay.baselineTasks.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Нет базовых заданий — можно добавить заранее, без смены
                </p>
              ) : (
                <ul className="space-y-2">
                  {selectedDay.baselineTasks.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className="w-full rounded-lg border border-violet-100 bg-violet-50/40 p-3 text-left text-sm hover:bg-violet-50"
                        onClick={() => openBaselineForm(selectedDate, t)}
                      >
                        <p className="font-medium">{t.description}</p>
                        <p className="mt-1 text-xs text-violet-700">
                          Для всей смены · без тарифа
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Задания операторам
                </h4>
                {canEdit && (
                  <button
                    type="button"
                    className="text-xs font-medium text-lime-700"
                    onClick={() => openCreateTask(selectedDate)}
                  >
                    + Задание
                  </button>
                )}
              </div>
              {selectedDay.tasks.length === 0 ? (
                <p className="text-sm text-slate-500">Нет заданий</p>
              ) : (
                <ul className="space-y-2">
                  {selectedDay.tasks.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className="w-full rounded-lg border border-slate-200 p-3 text-left text-sm hover:bg-slate-50"
                        onClick={() => openEditTask(t, selectedDate)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium">{t.description}</p>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${spotTaskStatusClass(t.status)}`}
                          >
                            {spotTaskStatusLabel(t.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {t.assigneeName}
                          {t.plannedLabel ? ` · ${t.plannedLabel}` : ""}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {shiftForm && canEdit && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/40 p-4 admin-desktop:items-center admin-desktop:justify-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 space-y-3">
            <h3 className="font-semibold">
              {shiftForm.id ? "Редактировать смену" : "Назначить на смену"}
            </h3>
            <input
              type="date"
              className={inputClass}
              value={shiftForm.date}
              onChange={async (e) => {
                const date = e.target.value;
                const defaults = await loadShiftDefaults(date);
                setShiftForm((f) =>
                  f ? { ...f, date, ...defaults } : f,
                );
              }}
            />
            <select
              className={inputClass}
              value={shiftForm.memberId}
              onChange={(e) =>
                setShiftForm((f) =>
                  f
                    ? {
                        ...f,
                        memberId: e.target.value,
                        workAsAdmin: false,
                        plannedStaffId: "",
                      }
                    : f,
                )
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
            {isOperatorShift && (
              <>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={shiftForm.workAsAdmin}
                    onChange={(e) =>
                      setShiftForm((f) =>
                        f
                          ? {
                              ...f,
                              workAsAdmin: e.target.checked,
                              plannedStaffId: e.target.checked ? "" : f.plannedStaffId,
                            }
                          : f,
                      )
                    }
                  />
                  <span>
                    Работает как админ
                    <span className="block text-xs text-slate-500">
                      Почасовая смена без реверса и учёта пульт/спот
                    </span>
                  </span>
                </label>
                {!shiftForm.workAsAdmin && (
                  <select
                    className={inputClass}
                    value={shiftForm.plannedStaffId}
                    onChange={(e) =>
                      setShiftForm((f) =>
                        f ? { ...f, plannedStaffId: e.target.value } : f,
                      )
                    }
                  >
                    <option value="">Реверс</option>
                    {reverses.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
            <div className="flex gap-2">
              <input
                type="time"
                className={inputClass}
                value={shiftForm.plannedStart}
                onChange={(e) =>
                  setShiftForm((f) =>
                    f ? { ...f, plannedStart: e.target.value } : f,
                  )
                }
              />
              <input
                type="time"
                className={inputClass}
                value={shiftForm.plannedEnd}
                onChange={(e) =>
                  setShiftForm((f) =>
                    f ? { ...f, plannedEnd: e.target.value } : f,
                  )
                }
              />
            </div>
            {!shiftForm.id && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={addTaskAfterShift}
                  onChange={(e) => setAddTaskAfterShift(e.target.checked)}
                />
                Добавить задание после сохранения
              </label>
            )}
            <div className="flex gap-2">
              {shiftForm.id && (
                <button
                  type="button"
                  className={`${btnSecondary} text-red-600`}
                  onClick={() => deleteShift(shiftForm.id!)}
                >
                  Убрать
                </button>
              )}
              <button
                type="button"
                className={`${btnSecondary} flex-1`}
                onClick={() => {
                  setShiftForm(null);
                  setAddTaskAfterShift(false);
                }}
              >
                Закрыть
              </button>
              <button
                type="button"
                className={`${btnPrimary} flex-1`}
                disabled={saving}
                onClick={saveShift}
              >
                {saving ? "…" : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {taskForm && canEdit && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/40 p-4 admin-desktop:items-center admin-desktop:justify-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 space-y-3">
            <h3 className="font-semibold">
              {taskForm.id ? "Редактировать задание" : "Задание оператору"}
            </h3>
            <input
              type="date"
              className={inputClass}
              value={taskForm.date}
              onChange={(e) =>
                setTaskForm((f) => f && { ...f, date: e.target.value })
              }
            />
            <select
              className={inputClass}
              value={taskForm.assigneeMemberId}
              onChange={(e) =>
                setTaskForm((f) =>
                  f ? { ...f, assigneeMemberId: e.target.value } : f,
                )
              }
            >
              <option value="">Сотрудник</option>
              {operators.map((o) => (
                <option key={o.memberId} value={o.memberId}>
                  {o.name}
                </option>
              ))}
            </select>
            <textarea
              className={inputClass}
              rows={2}
              placeholder="Описание работы"
              value={taskForm.description}
              onChange={(e) =>
                setTaskForm((f) => f && { ...f, description: e.target.value })
              }
            />
            <select
              className={inputClass}
              value={taskForm.category}
              onChange={(e) =>
                setTaskForm((f) => f && { ...f, category: e.target.value })
              }
            >
              <option value="">Категория (необязательно)</option>
              {SPOT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className={
                  taskForm.timeMode === "duration" ? btnPrimary : btnSecondary
                }
                onClick={() =>
                  setTaskForm((f) => f && { ...f, timeMode: "duration" })
                }
              >
                Длительность
              </button>
              <button
                type="button"
                className={
                  taskForm.timeMode === "window" ? btnPrimary : btnSecondary
                }
                onClick={() =>
                  setTaskForm((f) => f && { ...f, timeMode: "window" })
                }
              >
                Окно времени
              </button>
            </div>
            {taskForm.timeMode === "duration" ? (
              <input
                type="number"
                className={inputClass}
                value={taskForm.plannedMinutes}
                onChange={(e) =>
                  setTaskForm((f) =>
                    f ? { ...f, plannedMinutes: Number(e.target.value) } : f,
                  )
                }
                placeholder="Минут"
                min={1}
              />
            ) : (
              <div className="flex gap-2">
                <input
                  type="time"
                  className={inputClass}
                  value={taskForm.plannedTimeFrom}
                  onChange={(e) =>
                    setTaskForm((f) =>
                      f ? { ...f, plannedTimeFrom: e.target.value } : f,
                    )
                  }
                />
                <input
                  type="time"
                  className={inputClass}
                  value={taskForm.plannedTimeTo}
                  onChange={(e) =>
                    setTaskForm((f) =>
                      f ? { ...f, plannedTimeTo: e.target.value } : f,
                    )
                  }
                />
              </div>
            )}
            {taskForm.id && (
              <select
                className={inputClass}
                value={taskForm.status}
                onChange={(e) =>
                  setTaskForm((f) => f && { ...f, status: e.target.value })
                }
              >
                {SPOT_TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {spotTaskStatusLabel(s)}
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              {taskForm.id && taskForm.status !== "done" && (
                <button
                  type="button"
                  className={`${btnSecondary} text-red-600`}
                  onClick={() => cancelTask(taskForm.id!)}
                >
                  Отменить
                </button>
              )}
              <button
                type="button"
                className={`${btnSecondary} flex-1`}
                onClick={() => setTaskForm(null)}
              >
                Закрыть
              </button>
              <button
                type="button"
                className={`${btnPrimary} flex-1`}
                disabled={saving}
                onClick={saveTask}
              >
                {saving ? "…" : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {baselineForm && canEdit && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/40 p-4 admin-desktop:items-center admin-desktop:justify-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 space-y-3">
            <h3 className="font-semibold">
              {baselineForm.id ? "Базовое задание" : "Базовое задание на всех"}
            </h3>
            <p className="text-xs text-slate-500">
              Чеклист для смены без привязки к тарифу. Можно создать заранее,
              даже если сотрудники ещё не назначены. Отметку выполнения ставит
              сотрудник при закрытии смены.
            </p>
            <input
              type="date"
              className={inputClass}
              value={baselineForm.date}
              onChange={(e) =>
                setBaselineForm((f) => f && { ...f, date: e.target.value })
              }
            />
            <textarea
              className={inputClass}
              rows={3}
              placeholder="Например: Уборка спота"
              value={baselineForm.description}
              onChange={(e) =>
                setBaselineForm((f) =>
                  f ? { ...f, description: e.target.value } : f,
                )
              }
            />
            <div className="flex gap-2">
              {baselineForm.id && (
                <button
                  type="button"
                  className={`${btnSecondary} text-red-600`}
                  onClick={() => deleteBaseline(baselineForm.id!)}
                >
                  Удалить
                </button>
              )}
              <button
                type="button"
                className={`${btnSecondary} flex-1`}
                onClick={() => setBaselineForm(null)}
              >
                Закрыть
              </button>
              <button
                type="button"
                className={`${btnPrimary} flex-1`}
                disabled={saving}
                onClick={() => void saveBaseline()}
              >
                {saving ? "…" : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkFillOpen && canEdit && (calendarBranchId || branchId) && (
        <ShiftBulkFillModal
          month={month}
          monthLabel={monthLabel(month)}
          branchId={calendarBranchId || branchId!}
          members={members}
          reverses={reverses}
          onClose={() => setBulkFillOpen(false)}
          onDone={(summary) => {
            setSuccessMsg(summary);
            void loadCalendar();
          }}
        />
      )}
    </div>
  );
}

function DayCell({
  date,
  data,
  memberId,
  highlightMine,
  isToday,
  canEdit,
  showBranchNames,
  onSelect,
  onAddShift,
  onAddTask,
}: {
  date: string;
  data: DayData;
  memberId: string;
  highlightMine: boolean;
  isToday: boolean;
  canEdit: boolean;
  showBranchNames: boolean;
  onSelect: () => void;
  onAddShift: () => void;
  onAddTask: () => void;
}) {
  const dayNum = Number(date.split("-")[2]);
  const hasItems =
    data.shifts.length > 0 ||
    data.tasks.length > 0 ||
    data.baselineTasks.length > 0;
  const isMineDay = dayHasMine(data, memberId);

  return (
    <div
      className={`min-h-[100px] rounded-lg border p-1.5 text-left ${
        isToday ? "border-lime-400 bg-lime-50/50" : "border-slate-200 bg-white"
      } ${highlightMine && isMineDay ? "ring-2 ring-lime-300" : ""} ${
        hasItems ? "cursor-pointer hover:border-slate-300" : ""
      }`}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      role="button"
      tabIndex={0}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={`text-xs font-medium ${isToday ? "text-lime-800" : "text-slate-700"}`}
        >
          {dayNum}
        </span>
        {canEdit && (
          <div className="flex gap-0.5">
            <button
              type="button"
              className="rounded px-1 text-[10px] text-violet-600 hover:bg-violet-50"
              onClick={(e) => {
                e.stopPropagation();
                onAddShift();
              }}
              title="Назначить сотрудника"
            >
              с
            </button>
            <button
              type="button"
              className="rounded px-1 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              onClick={(e) => {
                e.stopPropagation();
                onAddTask();
              }}
              title="Добавить задание"
            >
              з
            </button>
          </div>
        )}
      </div>
      <div className="space-y-0.5">
        {data.shifts.slice(0, 2).map((s) => (
          <div
            key={s.id}
            className={`truncate rounded px-1 py-0.5 text-[10px] ${workShiftStatusClass(s.status)} ${
              highlightMine && s.memberId === memberId ? "ring-1 ring-lime-500" : ""
            }`}
            title={shiftDetailLabel(s)}
          >
            {s.memberName.split(" ")[0]}
          </div>
        ))}
        {data.shifts.length > 2 && (
          <p className="text-[9px] text-slate-400">+{data.shifts.length - 2} смен</p>
        )}
        {data.baselineTasks.slice(0, 2).map((t) => (
          <div
            key={t.id}
            className="truncate rounded px-1 py-0.5 text-[10px] bg-violet-50 text-violet-800"
            title={t.description}
          >
            {showBranchNames && t.branchName ? `${t.branchName}: ` : ""}👥 {t.description}
          </div>
        ))}
        {data.tasks.slice(0, 3).map((t) => (
          <div
            key={t.id}
            className={`truncate rounded px-1 py-0.5 text-[10px] ${spotTaskStatusClass(t.status)} ${
              highlightMine && t.assigneeMemberId === memberId
                ? "ring-1 ring-lime-500"
                : ""
            }`}
            title={`${t.description} — ${spotTaskStatusLabel(t.status)}`}
          >
            {showBranchNames && t.branchName ? `${t.branchName}: ` : ""}
            {t.description}
          </div>
        ))}
        {data.tasks.length > 3 && (
          <p className="text-[9px] text-slate-400">+{data.tasks.length - 3}</p>
        )}
      </div>
    </div>
  );
}
