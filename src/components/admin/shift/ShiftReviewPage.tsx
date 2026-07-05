"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMinutesLabel } from "@/lib/calendar-grid";
import { periodLast15Days } from "@/lib/date-ranges";
import { useSuperAdminBranchOptional } from "@/components/admin/SuperAdminBranchProvider";
import { DatePickerField } from "@/components/admin/DatePickerField";
import { ShiftReportCard, type ShiftData } from "./ShiftReportCard";
import { ShiftPayrollPanel } from "./ShiftPayrollPanel";

type ReviewTab = "review" | "payroll" | "baseline";

type SpotTaskRow = {
  id: string;
  description: string;
  status: string;
  plannedMinutes: number | null;
  plannedTimeFrom: string | null;
  plannedTimeTo: string | null;
  spotEntryId: string | null;
};

type EnrichedShift = ShiftData & {
  spotTasks?: SpotTaskRow[];
  adjustments?: { field: string; comment: string; createdAt: string }[];
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

function reviewStatusLabel(status: string): string {
  if (status === "closed") return "Ждёт утверждения";
  if (status === "open") return "Не закрыта сотрудником";
  return status;
}

export function ShiftReviewPage({
  usesBranchPicker = true,
  branchId: fixedBranchId = null,
}: {
  usesBranchPicker?: boolean;
  branchId?: string | null;
}) {
  const superBranch = useSuperAdminBranchOptional();
  const defaultPeriod = periodLast15Days();
  const [tab, setTab] = useState<ReviewTab>("payroll");
  const [reviewFrom, setReviewFrom] = useState(defaultPeriod.from);
  const [reviewTo, setReviewTo] = useState(defaultPeriod.to);
  const [reviewBranchId, setReviewBranchId] = useState(
    () => fixedBranchId ?? superBranch?.branchId ?? "",
  );
  const [employees, setEmployees] = useState<{ memberId: string; name: string }[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [shifts, setShifts] = useState<EnrichedShift[]>([]);
  const [selected, setSelected] = useState<EnrichedShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("Проверено");
  const [showCorrect, setShowCorrect] = useState(false);
  const [panelOverride, setPanelOverride] = useState("");
  const [idleOverride, setIdleOverride] = useState("");
  const [correctComment, setCorrectComment] = useState("");
  const [baselineFrom, setBaselineFrom] = useState(defaultPeriod.from);
  const [baselineTo, setBaselineTo] = useState(defaultPeriod.to);
  const [baselineRows, setBaselineRows] = useState<
    {
      date: string;
      branchName: string;
      tasks: { id: string; description: string }[];
      completions: { taskId: string; memberName: string }[];
      handoffNotes: { memberName: string; comment: string }[];
      completionRate: number | null;
    }[]
  >([]);
  const [baselineLoading, setBaselineLoading] = useState(false);

  const memberIdsKey = [...selectedMembers].sort().join(",");

  useEffect(() => {
    if (usesBranchPicker && superBranch?.branchId) {
      setReviewBranchId((prev) => prev || superBranch.branchId);
    }
  }, [usesBranchPicker, superBranch?.branchId]);

  useEffect(() => {
    const bid = fixedBranchId ?? reviewBranchId;
    if (!bid) {
      setEmployees([]);
      return;
    }
    fetch(`/api/admin/shift-resources?branchId=${bid}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) return;
        setEmployees(
          (d.members ?? []).map((m: { memberId: string; name: string }) => ({
            memberId: m.memberId,
            name: m.name,
          })),
        );
      })
      .catch(() => setEmployees([]));
  }, [fixedBranchId, reviewBranchId]);

  function applyReviewBranch(id: string) {
    setReviewBranchId(id);
    setSelectedMembers(new Set());
    if (usesBranchPicker && id) superBranch?.setBranchId(id);
  }

  function toggleMember(id: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allMembersSelected =
    employees.length > 0 && selectedMembers.size === employees.length;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const q = new URLSearchParams({
      queue: "review",
      from: reviewFrom,
      to: reviewTo,
    });
    const bid = fixedBranchId ?? reviewBranchId;
    if (bid) q.set("branchId", bid);
    if (selectedMembers.size > 0) {
      q.set("memberIds", memberIdsKey);
    }
    const r = await fetch(`/api/admin/work-shifts?${q}`);
    const d = await r.json();
    if (!r.ok) {
      setError(typeof d.error === "string" ? d.error : "Ошибка загрузки");
      setShifts([]);
      setSelected(null);
    } else {
      const list = (d.shifts ?? []) as EnrichedShift[];
      setShifts(list);
      setSelected((prev) => list.find((s) => s.shift.id === prev?.shift.id) ?? list[0] ?? null);
    }
    setLoading(false);
  }, [reviewFrom, reviewTo, fixedBranchId, reviewBranchId, memberIdsKey, selectedMembers.size]);

  useEffect(() => {
    if (tab === "review") void load();
  }, [tab, load]);

  async function loadBaselineReport() {
    setBaselineLoading(true);
    setError("");
    const q = new URLSearchParams({ from: baselineFrom, to: baselineTo });
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
  }, [tab, baselineFrom, baselineTo]);

  async function approve(closeIfOpen = false) {
    if (!selected) return;
    setError("");
    const r = await fetch(`/api/admin/work-shifts/${selected.shift.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment, closeIfOpen }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(typeof d.error === "string" ? d.error : "Ошибка утверждения");
      return;
    }
    await load();
  }

  async function deleteShift(id: string) {
    if (!window.confirm("Удалить смену?")) return;
    const r = await fetch(`/api/admin/work-shifts/${id}`, { method: "DELETE" });
    if (r.ok) await load();
  }

  async function applyCorrection() {
    if (!selected || !correctComment.trim()) return;
    const body: Record<string, unknown> = { comment: correctComment.trim() };
    if (panelOverride !== "") body.panelMinutesOverride = Number(panelOverride);
    if (idleOverride !== "") body.idleMinutesOverride = Number(idleOverride);
    const r = await fetch(`/api/admin/work-shifts/${selected.shift.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return;
    const approveR = await fetch(`/api/admin/work-shifts/${selected.shift.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comment: correctComment.trim(),
        closeIfOpen: selected.shift.status === "open",
      }),
    });
    if (approveR.ok) {
      setShowCorrect(false);
      setPanelOverride("");
      setIdleOverride("");
      setCorrectComment("");
      await load();
    }
  }

  function taskPlanLabel(t: SpotTaskRow): string {
    if (t.plannedMinutes) return formatMinutesLabel(t.plannedMinutes);
    if (t.plannedTimeFrom && t.plannedTimeTo) {
      return `${t.plannedTimeFrom}–${t.plannedTimeTo}`;
    }
    return "—";
  }

  function taskFactMinutes(t: SpotTaskRow): string {
    if (!t.spotEntryId || !selected) return "—";
    const entry = selected.spotEntries.find((e) => e.id === t.spotEntryId);
    if (!entry?.endedAt) return "—";
    const min = Math.round(
      (new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime()) / 60_000,
    );
    return formatMinutesLabel(min);
  }

  const selectedIsOpen = selected?.shift.status === "open";

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
          Расчёт ЗП
        </button>
        <button
          type="button"
          onClick={() => setTab("review")}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            tab === "review"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600"
          }`}
        >
          Утверждение
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
          Базовые задания
        </button>
      </div>

      {tab === "baseline" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-600">
              Выполнение чеклиста смены и комментарии следующей смены о состоянии
              спота
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <DatePickerField
                value={baselineFrom}
                max={baselineTo}
                onChange={setBaselineFrom}
                className={inputClass}
              />
              <DatePickerField
                value={baselineTo}
                min={baselineFrom}
                onChange={setBaselineTo}
                className={inputClass}
              />
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
                onClick={() => void loadBaselineReport()}
              >
                Обновить
              </button>
            </div>
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          {baselineLoading && <p className="text-sm text-slate-500">Загрузка…</p>}
          {!baselineLoading && baselineRows.length === 0 && (
            <p className="text-sm text-slate-500">Нет данных за период</p>
          )}
          {baselineRows.map((row) => (
            <div
              key={`${row.date}-${row.branchName}`}
              className="rounded-xl border border-slate-200 bg-white p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {row.date} · {row.branchName}
                </p>
                {row.completionRate != null && (
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-800">
                    Выполнено {row.completionRate}%
                  </span>
                )}
              </div>
              {row.tasks.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500">Задания</p>
                  <ul className="mt-1 list-disc pl-4 text-slate-700">
                    {row.tasks.map((t) => (
                      <li key={t.id}>{t.description}</li>
                    ))}
                  </ul>
                </div>
              )}
              {row.completions.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500">Отметки</p>
                  <ul className="mt-1 space-y-1 text-slate-700">
                    {row.completions.map((c, i) => {
                      const task = row.tasks.find((t) => t.id === c.taskId);
                      return (
                        <li key={`${c.taskId}-${i}`}>
                          {task?.description ?? "Задание"} — {c.memberName}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {row.handoffNotes.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500">
                    Комментарии следующей смены
                  </p>
                  <ul className="mt-1 space-y-2">
                    {row.handoffNotes.map((n, i) => (
                      <li
                        key={i}
                        className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2"
                      >
                        <p className="text-xs text-amber-900">{n.memberName}</p>
                        <p className="mt-0.5 text-slate-800">{n.comment}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "payroll" && <ShiftPayrollPanel />}

      {tab === "review" && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">
              Смены, закрытые сотрудником и ожидающие проверки, а также прошлые смены,
              которые сотрудник не закрыл
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <DatePickerField
                label="Период с"
                value={reviewFrom}
                max={reviewTo}
                onChange={setReviewFrom}
                className={inputClass}
              />
              <DatePickerField
                label="Период по"
                value={reviewTo}
                min={reviewFrom}
                onChange={setReviewTo}
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

            {employees.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">Сотрудники</span>
                  <button
                    type="button"
                    className="text-xs text-lime-700 hover:underline"
                    onClick={() =>
                      setSelectedMembers(
                        allMembersSelected
                          ? new Set()
                          : new Set(employees.map((e) => e.memberId)),
                      )
                    }
                  >
                    {allMembersSelected ? "Снять все" : "Выбрать все"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {employees.map((e) => {
                    const active = selectedMembers.has(e.memberId);
                    return (
                      <label
                        key={e.memberId}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm ${
                          active
                            ? "border-lime-600 bg-lime-50 text-lime-900"
                            : "border-slate-200 text-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={active}
                          onChange={() => toggleMember(e.memberId)}
                        />
                        {e.name}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Пустой выбор — все сотрудники филиала
                </p>
              </div>
            )}

            <button
              type="button"
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
              onClick={() => void load()}
            >
              Обновить
            </button>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          {loading && <p className="text-sm text-slate-500">Загрузка…</p>}
          <div className="grid gap-4 admin-desktop:grid-cols-2">
            <div className="space-y-2">
              {shifts.map((s) => (
                <button
                  key={s.shift.id}
                  type="button"
                  onClick={() => setSelected(s)}
                  className={`w-full rounded-lg border p-3 text-left text-sm ${
                    selected?.shift.id === s.shift.id
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{s.shift.memberName}</p>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        s.shift.status === "open"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {reviewStatusLabel(s.shift.status)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {s.shift.date} · {s.shift.branchName} · {s.summary.totalAmount.toFixed(2)} BYN
                  </p>
                </button>
              ))}
              {!loading && shifts.length === 0 && (
                <p className="text-sm text-slate-500">
                  Нет смен на утверждение за выбранный период. Проверьте даты или вкладку
                  «Расчёт ЗП» — возможно, смены уже утверждены.
                </p>
              )}
            </div>
            {selected && (
              <div className="space-y-3">
                {selectedIsOpen && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Сотрудник не закрыл смену. Супер-админ может закрыть её и утвердить.
                  </p>
                )}
                <ShiftReportCard data={selected} />

                {selected.reverseAssignments.length > 0 && (
                  <div className="rounded-lg border border-slate-100 p-3 text-xs text-slate-600">
                    <p className="mb-1 font-medium text-slate-800">Реверсы</p>
                    {selected.reverseAssignments.map((a) => (
                      <p key={a.id}>
                        {a.staffName}:{" "}
                        {new Date(a.startedAt).toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {a.endedAt
                          ? ` – ${new Date(a.endedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
                          : " – …"}
                      </p>
                    ))}
                  </div>
                )}

                {(selected.spotTasks?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-slate-100 p-3 text-xs">
                    <p className="mb-2 font-medium text-slate-800">Задания (план / факт)</p>
                    {selected.spotTasks!.map((t) => (
                      <p key={t.id} className="text-slate-600">
                        {t.description}: план {taskPlanLabel(t)}, факт {taskFactMinutes(t)} · {t.status}
                      </p>
                    ))}
                  </div>
                )}

                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Комментарий при утверждении"
                />
                {selectedIsOpen ? (
                  <button
                    type="button"
                    className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white"
                    onClick={() => void approve(true)}
                  >
                    Закрыть и утвердить
                  </button>
                ) : (
                  <button
                    type="button"
                    className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white"
                    onClick={() => void approve(false)}
                  >
                    Всё верно — утвердить
                  </button>
                )}
                <button
                  type="button"
                  className="w-full rounded-lg border border-slate-300 py-2 text-sm"
                  onClick={() => setShowCorrect((v) => !v)}
                >
                  Скорректировать
                </button>
                <button
                  type="button"
                  className="w-full rounded-lg border border-red-200 py-2 text-sm text-red-600"
                  onClick={() => void deleteShift(selected.shift.id)}
                >
                  Удалить смену
                </button>
                {showCorrect && (
                  <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <input
                      type="number"
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder="Пульт, мин (override)"
                      value={panelOverride}
                      onChange={(e) => setPanelOverride(e.target.value)}
                    />
                    <input
                      type="number"
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder="Простой, мин (override)"
                      value={idleOverride}
                      onChange={(e) => setIdleOverride(e.target.value)}
                    />
                    <textarea
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      rows={2}
                      placeholder="Причина корректировки (обязательно)"
                      value={correctComment}
                      onChange={(e) => setCorrectComment(e.target.value)}
                    />
                    <button
                      type="button"
                      className="w-full rounded-lg bg-amber-700 py-2 text-sm text-white"
                      onClick={() => void applyCorrection()}
                    >
                      Сохранить и утвердить
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
