"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardCheck, X } from "lucide-react";
import { SPOT_CATEGORIES } from "@/lib/payroll/spot-categories";
import { spotTaskStatusLabel } from "@/lib/payroll/spot-task-status";
import { ShiftReportCard, type ShiftData } from "./ShiftReportCard";
import { ShiftCalendar } from "./ShiftCalendar";
import { ShiftTomorrowBanner } from "./ShiftTomorrowBanner";
import { MyShiftsPanel } from "./MyShiftsPanel";
import {
  ShiftReadinessModal,
  formatReadinessSummary,
} from "./ShiftReadinessModal";
import type { ShiftReadinessPayload } from "@/lib/payroll/shift-readiness";
import {
  formatBranchOpenLabel,
  type BranchShiftStatus,
} from "@/lib/payroll/branch-shift-status";
import { useSuperAdminBranchOptional } from "@/components/admin/SuperAdminBranchProvider";
import { formatDateKey, formatTimeMinsk } from "@/lib/time";

type AdminRole = "super_admin" | "branch_manager" | "branch_admin" | "branch_operator";
const BRANCH_ADMIN_ROLE = "branch_admin";
const BRANCH_OPERATOR_ROLE = "branch_operator";
const SUPER_ADMIN_ROLE = "super_admin";
const BRANCH_MANAGER_ROLE = "branch_manager";

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
  workAsAdminElevated?: boolean;
  managerOnDutyElevated?: boolean;
  managerOnDutyBranchId?: string | null;
  isBranchManager?: boolean;
  managedBranchIds?: string[];
  tasksOnly?: boolean;
};

const btn =
  "rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50";
const btnPrimary = `${btn} bg-slate-900 text-white`;
const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-800`;
const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

function currentMinskTime() {
  return new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Minsk",
  });
}

function defaultWorkStartTime() {
  return currentMinskTime();
}

function defaultCompletedWorkStartTime(durationMins: number) {
  const endMs = Date.now() - 60_000;
  const startMs = endMs - durationMins * 60_000;
  return new Date(startMs).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Minsk",
  });
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const endH = Math.floor(total / 60) % 24;
  const endM = total % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

export function ShiftAdminPage({
  role,
  branchId,
  memberId,
  workAsAdminElevated = false,
  managerOnDutyElevated = false,
  managerOnDutyBranchId = null,
  isBranchManager = false,
  managedBranchIds = [],
  tasksOnly = false,
}: Props) {
  const superBranch = useSuperAdminBranchOptional();
  const searchParams = useSearchParams();
  const [operatingBranchId, setOperatingBranchId] = useState("");
  const [branchOptions, setBranchOptions] = useState<{ id: string; name: string }[]>([]);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [readinessMode, setReadinessMode] = useState<"review" | "open">("open");
  const [readinessSummary, setReadinessSummary] = useState<ShiftReadinessPayload | null>(
    null,
  );
  const [readinessSummaryLoading, setReadinessSummaryLoading] = useState(false);

  const isOperator = role === BRANCH_OPERATOR_ROLE;
  const isBranchAdmin = role === BRANCH_ADMIN_ROLE;
  const isSuperAdmin = role === SUPER_ADMIN_ROLE;
  const canEditCalendar =
    isSuperAdmin || isBranchManager || workAsAdminElevated || managerOnDutyElevated;
  const canRequestChanges = isOperator && !workAsAdminElevated;

  const effectiveBranchId =
    branchId ?? superBranch?.branchId ?? (operatingBranchId || null);

  const canViewReadiness =
    isSuperAdmin ||
    isBranchManager ||
    isBranchAdmin ||
    isOperator ||
    workAsAdminElevated ||
    managerOnDutyElevated;

  const canEditReadiness = Boolean(
    effectiveBranchId &&
      (isSuperAdmin ||
        (isBranchManager &&
          managedBranchIds.includes(effectiveBranchId)) ||
        (isBranchAdmin && branchId === effectiveBranchId) ||
        (workAsAdminElevated && branchId === effectiveBranchId) ||
        (managerOnDutyElevated && managerOnDutyBranchId === effectiveBranchId)),
  );

  const canAddShiftOnReadiness =
    isSuperAdmin ||
    (isBranchManager &&
      Boolean(
        effectiveBranchId && managedBranchIds.includes(effectiveBranchId),
      )) ||
    (isBranchAdmin && branchId === effectiveBranchId);

  const canAddManagerOnReadiness = Boolean(
    effectiveBranchId &&
      (isSuperAdmin ||
        (isBranchManager && managedBranchIds.includes(effectiveBranchId))),
  );

  const [tab, setTab] = useState<Tab>(tasksOnly ? "calendar" : "today");
  const [data, setData] = useState<ShiftData | null>(null);
  const [branchToday, setBranchToday] = useState<BranchShiftStatus | null>(null);
  const [tasks, setTasks] = useState<SpotTask[]>([]);
  const [reverses, setReverses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedReverse, setSelectedReverse] = useState("");
  const [baselineChecked, setBaselineChecked] = useState<Set<string>>(new Set());
  const [checklistChecked, setChecklistChecked] = useState<Set<string>>(new Set());
  const [showCloseSummary, setShowCloseSummary] = useState(false);
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [openShiftStart, setOpenShiftStart] = useState(defaultWorkStartTime);
  const [openHandoffComment, setOpenHandoffComment] = useState("");
  const [previousHandoffText, setPreviousHandoffText] = useState<string | null>(null);
  const [handoffComment, setHandoffComment] = useState("");
  const [handoffTargetDate, setHandoffTargetDate] = useState<string | null>(null);
  const [showHandoff, setShowHandoff] = useState(false);

  const [workModalOpen, setWorkModalOpen] = useState(false);
  const [workComment, setWorkComment] = useState("");
  const [workFrom, setWorkFrom] = useState(defaultWorkStartTime);
  const [workDurationMins, setWorkDurationMins] = useState(30);
  const [workCategory, setWorkCategory] = useState("");
  const [workTaskId, setWorkTaskId] = useState<string | null>(null);
  const [workSaving, setWorkSaving] = useState(false);

  const loadShift = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin/work-shifts");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      setData(d.today ?? null);
      setBranchToday(d.branchToday ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadResources = useCallback(async () => {
    if (!effectiveBranchId) return;
    const r = await fetch(`/api/admin/shift-resources?branchId=${effectiveBranchId}`);
    const d = await r.json();
    if (r.ok) setReverses(d.reverses ?? []);
  }, [effectiveBranchId]);

  useEffect(() => {
    if ((!isSuperAdmin && !isBranchManager) || branchId) return;
    void fetch("/api/admin/branches")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) return;
        let list = (d.branches ?? []) as { id: string; name: string }[];
        if (isBranchManager && managedBranchIds.length) {
          const allowed = new Set(managedBranchIds);
          list = list.filter((b) => allowed.has(b.id));
        }
        setBranchOptions(list);
        setOperatingBranchId((prev) => prev || superBranch?.branchId || list[0]?.id || "");
      })
      .catch(() => undefined);
  }, [isSuperAdmin, isBranchManager, branchId, managedBranchIds.join(","), superBranch?.branchId]);

  useEffect(() => {
    if (superBranch?.branchId && !branchId) {
      setOperatingBranchId(superBranch.branchId);
    }
  }, [superBranch?.branchId, branchId]);

  const loadTasks = useCallback(async () => {
    const dateForTasks = data?.shift?.date;
    if (!dateForTasks) return;
    const q = new URLSearchParams({ date: dateForTasks, mine: "1" });
    const r = await fetch(`/api/admin/spot-tasks?${q}`);
    const d = await r.json();
    if (r.ok) setTasks(d.tasks ?? []);
  }, [data?.shift?.date]);

  const todayDateKey = formatDateKey(new Date());

  const loadReadinessSummary = useCallback(async () => {
    if (!canViewReadiness || !effectiveBranchId) return;
    setReadinessSummaryLoading(true);
    try {
      const q = new URLSearchParams({ branchId: effectiveBranchId, date: todayDateKey });
      const r = await fetch(`/api/admin/shift-readiness?${q}`);
      const d = await r.json();
      if (r.ok) setReadinessSummary(d);
    } catch {
      /* ignore */
    } finally {
      setReadinessSummaryLoading(false);
    }
  }, [canViewReadiness, effectiveBranchId, todayDateKey]);

  useEffect(() => {
    loadShift();
    loadResources();
  }, [loadShift, loadResources]);

  useEffect(() => {
    if (tab === "today" && canViewReadiness && effectiveBranchId) {
      void loadReadinessSummary();
      const timer = window.setInterval(() => void loadReadinessSummary(), 30_000);
      return () => window.clearInterval(timer);
    }
  }, [tab, canViewReadiness, effectiveBranchId, loadReadinessSummary]);

  useEffect(() => {
    if (searchParams.get("check") !== "1") return;
    if (!canViewReadiness || !effectiveBranchId) return;
    setReadinessMode("open");
    setReadinessOpen(true);
  }, [searchParams, canViewReadiness, effectiveBranchId]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "calendar" || tabParam === "today" || tabParam === "report") {
      setTab(tabParam);
    }
  }, [searchParams]);

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
    if (!effectiveBranchId) {
      setError("Выберите филиал для смены");
      return;
    }
    const payload: Record<string, string> = {
      actualStart: openShiftStart,
    };
    if (openHandoffComment.trim()) {
      payload.handoffComment = openHandoffComment.trim();
    }
    if (!branchId) {
      payload.branchId = effectiveBranchId;
    }
    const r = await fetch("/api/admin/work-shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    setData(d);
    setShowHandoff(false);
    setOpenShiftModal(false);
    setOpenHandoffComment("");
  }

  async function prepareOpenShift() {
    if (canViewReadiness && effectiveBranchId) {
      setReadinessMode("open");
      setReadinessOpen(true);
      return;
    }
    setOpenShiftStart(currentMinskTime());
    setOpenHandoffComment("");
    setPreviousHandoffText(null);
    if (effectiveBranchId) {
      const q = new URLSearchParams({
        branchId: effectiveBranchId,
        shiftDate: new Date().toISOString().slice(0, 10),
      });
      void fetch(`/api/admin/shift-handoff?${q}`)
        .then(async (r) => {
          const d = await r.json();
          if (r.ok && d.existingComment) {
            setPreviousHandoffText(d.existingComment as string);
          }
        })
        .catch(() => undefined);
    }
    setOpenShiftModal(true);
  }

  function openReadinessReview() {
    if (!effectiveBranchId) return;
    setReadinessMode("review");
    setReadinessOpen(true);
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
        checklistCompletedItemIds: [...checklistChecked],
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    setData(d);
    setShowCloseSummary(false);
  }

  useEffect(() => {
    if (!data?.checklistItems) return;
    setChecklistChecked(
      new Set(data.checklistItems.filter((i) => i.completed).map((i) => i.id)),
    );
  }, [data?.shift?.id, data?.checklistItems]);

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

  function closeWorkModal() {
    setWorkModalOpen(false);
    setWorkTaskId(null);
    setWorkComment("");
    setWorkCategory("");
    setWorkFrom(defaultWorkStartTime());
    setWorkDurationMins(30);
    setWorkSaving(false);
  }

  function openWorkModal(task?: SpotTask) {
    setWorkTaskId(task?.id ?? null);
    setWorkComment(task?.description ?? "");
    setWorkCategory(task?.category ?? "");
    setWorkFrom(defaultCompletedWorkStartTime(30));
    setWorkDurationMins(30);
    setWorkModalOpen(true);
  }

  function workTimeRange() {
    const timeTo = addMinutesToTime(workFrom, workDurationMins);
    return { timeFrom: workFrom, timeTo };
  }

  async function savePlannedWork() {
    if (!data || !workComment.trim() || !workCategory || workDurationMins < 1) {
      setError("Заполните категорию, описание и длительность");
      return;
    }
    setWorkSaving(true);
    setError("");
    const { timeFrom, timeTo } = workTimeRange();
    try {
      const r = await fetch("/api/admin/spot-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigneeMemberId: memberId,
          branchId: data.shift.branchId,
          date: data.shift.date,
          description: workComment.trim(),
          category: workCategory,
          plannedMinutes: workDurationMins,
          plannedTimeFrom: timeFrom,
          plannedTimeTo: timeTo,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      closeWorkModal();
      loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setWorkSaving(false);
    }
  }

  async function saveCompletedWork() {
    if (!data || !workComment.trim() || !workCategory || workDurationMins < 1) {
      setError("Заполните категорию, описание и длительность");
      return;
    }
    const { timeFrom, timeTo } = workTimeRange();
    if (timeTo > currentMinskTime()) {
      setError("Окончание не может быть позже текущего времени");
      return;
    }
    setWorkSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/work-shifts/${data.shift.id}/spot-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: workComment.trim(),
          category: workCategory,
          timeFrom,
          timeTo,
          taskId: workTaskId || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      closeWorkModal();
      setData(d);
      loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setWorkSaving(false);
    }
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
    openWorkModal(task);
  }

  const activeAssign = data?.reverseAssignments.find((a) => !a.endedAt);
  const shiftOpen = data?.shift.status === "open";
  const shiftScheduled = data?.shift.status === "scheduled";
  const isOpRole = data?.summary.isOperator ?? isOperator;

  const tabs: { id: Tab; label: string }[] = [
    ...(!tasksOnly ? [{ id: "today" as Tab, label: "Сегодня" }] : []),
    { id: "calendar" as Tab, label: "Календарь" },
    ...(!tasksOnly ? [{ id: "report" as Tab, label: "Мои смены" }] : []),
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
          {(isSuperAdmin || isBranchManager) && !branchId && branchOptions.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Филиал</span>
              <select
                className={inputClass}
                value={superBranch?.branchId || operatingBranchId}
                onChange={(e) => {
                  const id = e.target.value;
                  setOperatingBranchId(id);
                  superBranch?.setBranchId(id);
                }}
              >
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {loading && <p className="text-sm text-slate-500">Загрузка…</p>}

          {!loading && !data && (
            <div
              className={`rounded-xl border p-6 text-center ${
                branchToday?.isOpen
                  ? "border-green-200 bg-green-50"
                  : "border-dashed border-slate-300"
              }`}
              data-onboarding="shift-open"
            >
              {branchToday?.isOpen ? (
                <>
                  <p className="text-sm font-medium text-green-800">Филиал работает</p>
                  <p className="mt-1 text-xs text-green-700">
                    {formatBranchOpenLabel(branchToday)}
                    {branchToday.openShifts[0]?.actualStart
                      ? ` · с ${formatTimeMinsk(branchToday.openShifts[0].actualStart)}`
                      : ""}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">Ваша смена ещё не открыта</p>
                </>
              ) : (
                <p className="mb-3 text-sm text-slate-600">Смена не открыта</p>
              )}
              <button type="button" className={`${btnPrimary} mt-3`} onClick={() => void prepareOpenShift()}>
                Начать смену
              </button>
            </div>
          )}

          {!loading && canViewReadiness && effectiveBranchId && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-lime-100 text-lime-800">
                  <ClipboardCheck className="size-5" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">Проверка перед сменой</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {readinessSummaryLoading
                      ? "Загрузка…"
                      : readinessSummary
                        ? formatReadinessSummary(readinessSummary)
                        : "Ресурсы и назначения на сегодня"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={`${btnSecondary} mt-3 w-full touch-manipulation sm:w-auto`}
                onClick={openReadinessReview}
              >
                Проверить
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
                          {(data.summary.unfinishedAppointmentCount ?? 0) > 0 && (
                            <p className="mt-0.5 text-[10px] text-amber-700">
                              не завершено: {data.summary.unfinishedAppointmentCount}
                            </p>
                          )}
                          {(data.summary.inServiceCount ?? 0) > 0 && (
                            <p className="mt-0.5 text-[10px] text-amber-700">
                              в работе: {data.summary.inServiceCount}
                            </p>
                          )}
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          <p className="text-slate-500">Спот</p>
                          <p className="font-semibold">
                            {data.summary.lines.find((l) => l.kind === "spot")?.hoursLabel ?? "0"}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">к проверке</p>
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
                                    onClick={() => openCompleteTask(t)}
                                  >
                                    Выполнена
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}

                      <div>
                        <p className="mb-2 text-xs font-medium text-slate-700">Работы на споте</p>
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={() => openWorkModal()}
                        >
                          Добавить работу
                        </button>
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

                  {!showCloseSummary ? (
                    <button
                      type="button"
                      className={`${btnPrimary} w-full`}
                      onClick={() => setShowCloseSummary(true)}
                    >
                      Завершить смену
                    </button>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                      <p className="text-sm font-medium text-slate-900">Итог смены</p>
                      {isBranchManager && (
                        <p className="text-xs text-lime-800">
                          Смена будет утверждена автоматически после закрытия.
                        </p>
                      )}
                      <p className="text-xs text-slate-600">
                        Пульт {data.summary.lines.find((l) => l.kind === "panel")?.hoursLabel ?? "0"} · Спот{" "}
                        {data.summary.lines.find((l) => l.kind === "spot")?.hoursLabel ?? "0"} · Простой{" "}
                        {data.summary.lines.find((l) => l.kind === "idle")?.hoursLabel ?? "0"}
                      </p>
                      {(data.checklistItems?.length ?? 0) > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-medium text-slate-700">Чеклист филиала</p>
                          <ul className="space-y-2">
                            {data.checklistItems!.map((item) => (
                              <li key={item.id}>
                                <label className="flex items-start gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    checked={checklistChecked.has(item.id)}
                                    onChange={(e) => {
                                      setChecklistChecked((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(item.id);
                                        else next.delete(item.id);
                                        return next;
                                      });
                                    }}
                                  />
                                  <span>{item.label}</span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(data.summary.unfinishedAppointmentCount ?? 0) > 0 && (
                        <p className="text-xs text-amber-700">
                          В журнале {data.summary.unfinishedAppointmentCount} незавершённых записей — проверьте их перед закрытием смены
                        </p>
                      )}
                      {(data.summary.inServiceCount ?? 0) > 0 && (
                        <p className="text-xs text-amber-700">
                          Завершите катания в журнале — иначе время не попадёт в пульт
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={btnPrimary}
                          disabled={
                            (data.checklistItems?.length ?? 0) > 0 &&
                            checklistChecked.size < (data.checklistItems?.length ?? 0)
                          }
                          onClick={() => void closeShift()}
                        >
                          Подтвердить закрытие
                        </button>
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={() => setShowCloseSummary(false)}
                        >
                          Назад
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <ShiftReportCard data={data} />
                  {shiftScheduled && (
                    <button
                      type="button"
                      className={`${btnPrimary} w-full touch-manipulation`}
                      onClick={() => void prepareOpenShift()}
                    >
                      Начать смену
                    </button>
                  )}
                  {data.shift.status === "closed" && (
                    <p className="text-xs text-slate-600">
                      <button type="button" className="text-lime-700 underline" onClick={() => setTab("report")}>
                        Проверить смену
                      </button>{" "}
                      во вкладке «Мои смены»
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "calendar" && (
        <div data-onboarding="shift-calendar">
          <ShiftCalendar
            role={role}
            branchId={branchId}
            memberId={memberId}
            canEdit={canEditCalendar}
            canRequestChanges={canRequestChanges}
          />
        </div>
      )}

      {tab === "report" && (
        <MyShiftsPanel onGoToday={() => setTab("today")} />
      )}

      {effectiveBranchId && (
        <ShiftReadinessModal
          open={readinessOpen}
          onClose={() => {
            setReadinessOpen(false);
            void loadReadinessSummary();
          }}
          branchId={effectiveBranchId}
          branchOptions={branchOptions}
          onBranchChange={(id) => {
            setOperatingBranchId(id);
            superBranch?.setBranchId?.(id);
          }}
          date={todayDateKey}
          mode={readinessMode}
          canEdit={canEditReadiness}
          canAddShift={canAddShiftOnReadiness}
          canAddManager={canAddManagerOnReadiness}
          onShiftOpened={(shiftData) => {
            setData(shiftData);
            setShowHandoff(false);
            void loadShift();
            void loadReadinessSummary();
          }}
        />
      )}

      {openShiftModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-lg space-y-3">
            <h3 className="font-semibold text-slate-900">Начать смену</h3>
            {previousHandoffText && (
              <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                <p className="font-medium">Комментарий прошлой смены:</p>
                <p>{previousHandoffText}</p>
              </div>
            )}
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Начало смены</span>
              <input
                type="time"
                className={inputClass}
                value={openShiftStart}
                onChange={(e) => setOpenShiftStart(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">
                Что не сделано с прошлой смены?
              </span>
              <textarea
                className={inputClass}
                rows={2}
                value={openHandoffComment}
                onChange={(e) => setOpenHandoffComment(e.target.value)}
                placeholder="Необязательно"
              />
            </label>
            <div className="flex gap-2">
              <button type="button" className={btnPrimary} onClick={() => void startShift()}>
                Начать
              </button>
              <button type="button" className={btnSecondary} onClick={() => setOpenShiftModal(false)}>
                Позже
              </button>
            </div>
          </div>
        </div>
      )}

      {workModalOpen && data && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={closeWorkModal}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-4 shadow-lg space-y-3"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="spot-work-title"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 id="spot-work-title" className="font-semibold text-slate-900">
                Добавить работу
              </h3>
              <button
                type="button"
                onClick={closeWorkModal}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Закрыть"
              >
                <X className="size-5" strokeWidth={2} />
              </button>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Категория</span>
              <select
                className={inputClass}
                value={workCategory}
                onChange={(e) => setWorkCategory(e.target.value)}
                required
              >
                <option value="">Выберите категорию</option>
                {SPOT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Описание</span>
              <textarea
                className={inputClass}
                rows={3}
                placeholder="Что нужно сделать или что сделано"
                value={workComment}
                onChange={(e) => setWorkComment(e.target.value)}
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Начало</span>
                <input
                  type="time"
                  className={inputClass}
                  value={workFrom}
                  onChange={(e) => setWorkFrom(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Длительность, мин</span>
                <input
                  type="number"
                  min={1}
                  step={5}
                  className={inputClass}
                  value={workDurationMins}
                  onChange={(e) => setWorkDurationMins(Number(e.target.value))}
                />
              </label>
            </div>

            <p className="text-xs text-slate-500">
              Окончание: {workTimeRange().timeTo}
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              {!workTaskId && (
                <button
                  type="button"
                  className={`${btnSecondary} flex-1`}
                  disabled={workSaving}
                  onClick={() => void savePlannedWork()}
                >
                  Сохранить
                </button>
              )}
              <button
                type="button"
                className={`${btnPrimary} flex-1`}
                disabled={workSaving}
                onClick={() => void saveCompletedWork()}
              >
                Выполнена
              </button>
            </div>
            <p className="text-[11px] leading-snug text-slate-400">
              {workTaskId
                ? "Укажите фактическое время и нажмите «Выполнена»."
                : "«Сохранить» — запланировать на потом. «Выполнена» — работа уже сделана, время попадёт в смену."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
