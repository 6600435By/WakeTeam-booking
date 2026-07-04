"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDurationMinutes, formatMoney } from "@/lib/payroll/shift-summary";
import { useSuperAdminBranchOptional } from "@/components/admin/SuperAdminBranchProvider";
import type { MemberPayrollBlock, PayrollReport } from "@/lib/payroll/payroll-report";

type Employee = {
  memberId: string;
  name: string;
  role: string;
  branchId: string | null;
  branchName: string | null;
};

type Branch = { id: string; name: string };

type PayrollShift = MemberPayrollBlock["shifts"][number];

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";
const btn =
  "rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50";
const btnPrimary = `${btn} bg-slate-900 text-white`;
const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-800`;

const STATUS_LABEL: Record<string, string> = {
  closed: "На проверке",
  approved: "Утверждена",
};

function isoToTimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function dateTimeIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+03:00`).toISOString();
}

type EditForm = {
  shiftId: string;
  date: string;
  isOperator: boolean;
  timeFrom: string;
  timeTo: string;
  panelOverride: string;
  idleOverride: string;
  comment: string;
};

export function ShiftPayrollPanel() {
  const superBranch = useSuperAdminBranchOptional();
  const [from, setFrom] = useState("2026-06-15");
  const [to, setTo] = useState("2026-06-29");
  const [branchId, setBranchId] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [report, setReport] = useState<PayrollReport | null>(null);
  const [monthlyLines, setMonthlyLines] = useState<
    {
      memberId: string;
      memberName: string;
      suggestedAmount: number;
      confirmedAmount: number | null;
      comment: string | null;
    }[]
  >([]);
  const [monthlyDrafts, setMonthlyDrafts] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<{
    summary: {
      approvedAmount: number;
      pendingAmount: number;
      openShiftCount: number;
      closedShiftCount: number;
    };
    actionQueue: {
      shiftId: string;
      date: string;
      memberName: string;
      status: string;
      requiresSuperAdmin: boolean;
      employeeSubmitted: boolean;
      previewAmount: number;
    }[];
    pendingGrandTotal: { amount: number };
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (superBranch?.branchPickerMode && superBranch.branchId && !branchId) {
      setBranchId(superBranch.branchId);
    }
  }, [superBranch?.branchPickerMode, superBranch?.branchId, branchId]);

  const memberIdsKey = [...selectedMembers].sort().join(",");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ from, to });
      if (branchId) q.set("branchId", branchId);
      if (selectedMembers.size > 0) {
        q.set("memberIds", memberIdsKey);
      }
      const r = await fetch(`/api/admin/payroll-report?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка загрузки");
      setReport({
        from: d.from,
        to: d.to,
        members: d.members,
        grandTotal: d.grandTotal,
      });
      setEmployees(d.employees ?? []);
      setBranches(d.branches ?? []);
      setMonthlyLines(d.monthlyLines ?? []);
      const drafts: Record<string, string> = {};
      for (const line of d.monthlyLines ?? []) {
        drafts[line.memberId] = String(
          line.confirmedAmount ?? line.suggestedAmount ?? "",
        );
      }
      setMonthlyDrafts(drafts);

      const rs = await fetch(`/api/admin/payroll-stats?${q}`);
      const sd = await rs.json();
      if (rs.ok) setStats(sd);
      else setStats(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [from, to, branchId, memberIdsKey, selectedMembers.size]);

  useEffect(() => {
    void load();
  }, [load]);

  const allSelected =
    employees.length > 0 && selectedMembers.size === employees.length;

  function toggleMember(id: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllMembers() {
    if (allSelected) setSelectedMembers(new Set());
    else setSelectedMembers(new Set(employees.map((e) => e.memberId)));
  }

  async function confirmMonthly(memberId: string, suggestedAmount: number) {
    const raw = monthlyDrafts[memberId] ?? String(suggestedAmount);
    const confirmedAmount = Number(raw);
    if (!Number.isFinite(confirmedAmount) || confirmedAmount < 0) {
      setError("Укажите корректную сумму оклада");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/admin/payroll-report", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          periodFrom: from,
          periodTo: to,
          confirmedAmount,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  const visibleMembers = useMemo(() => report?.members ?? [], [report]);

  useEffect(() => {
    if (visibleMembers[0] && !expandedMember) {
      setExpandedMember(visibleMembers[0].memberId);
    }
  }, [visibleMembers, expandedMember]);

  function openEdit(shift: PayrollShift) {
    setEditForm({
      shiftId: shift.shiftId,
      date: shift.date,
      isOperator: shift.isOperator,
      timeFrom: isoToTimeInput(shift.actualStart),
      timeTo: isoToTimeInput(shift.actualEnd),
      panelOverride: shift.isOperator ? String(shift.panelMinutes) : "",
      idleOverride: shift.isOperator ? String(shift.idleMinutes) : "",
      comment: "",
    });
  }

  async function saveEdit() {
    if (!editForm || !editForm.comment.trim()) {
      setError("Укажите комментарий к изменению");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        comment: editForm.comment.trim(),
      };
      if (editForm.timeFrom) {
        body.actualStart = dateTimeIso(editForm.date, editForm.timeFrom);
      }
      if (editForm.timeTo) {
        body.actualEnd = dateTimeIso(editForm.date, editForm.timeTo);
      }
      if (editForm.isOperator && editForm.panelOverride !== "") {
        body.panelMinutesOverride = Number(editForm.panelOverride);
      }
      if (editForm.isOperator && editForm.idleOverride !== "") {
        body.idleMinutesOverride = Number(editForm.idleOverride);
      }
      const r = await fetch(`/api/admin/work-shifts/${editForm.shiftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка сохранения");
      setEditForm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function deleteShift(shift: PayrollShift) {
    if (
      !window.confirm(
        `Удалить смену ${shift.date} (${shift.memberName})? Это действие нельзя отменить.`,
      )
    ) {
      return;
    }
    const r = await fetch(`/api/admin/work-shifts/${shift.shiftId}`, {
      method: "DELETE",
    });
    const d = await r.json();
    if (!r.ok) {
      setError(typeof d.error === "string" ? d.error : "Не удалось удалить");
      return;
    }
    await load();
  }

  function lineSummary(shift: PayrollShift): string {
    if (!shift.isOperator) {
      return formatDurationMinutes(shift.shiftMinutes);
    }
    return [
      `пульт ${formatDurationMinutes(shift.panelMinutes)}`,
      `спот ${formatDurationMinutes(shift.spotMinutes)}`,
      `простой ${formatDurationMinutes(shift.idleMinutes)}`,
    ].join(" · ");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Период расчёта</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">С</span>
            <input
              type="date"
              className={inputClass}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">По</span>
            <input
              type="date"
              className={inputClass}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          {branches.length > 0 && (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-slate-500">Филиал</span>
              <select
                className={inputClass}
                value={branchId}
                onChange={(e) => {
                  const id = e.target.value;
                  setBranchId(id);
                  setSelectedMembers(new Set());
                  if (superBranch?.branchPickerMode && id) superBranch.setBranchId(id);
                }}
              >
                <option value="">Все филиалы</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {stats && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div className="rounded-lg bg-emerald-50 p-2">
              <p className="text-[10px] text-emerald-800">К выплате</p>
              <p className="text-sm font-bold text-emerald-950">
                {stats.summary.approvedAmount.toFixed(2)} Br
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 p-2">
              <p className="text-[10px] text-amber-800">На проверке</p>
              <p className="text-sm font-bold text-amber-950">
                {stats.pendingGrandTotal.amount.toFixed(2)} Br
              </p>
              <p className="text-[10px] text-amber-700">{stats.summary.closedShiftCount} смен</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-[10px] text-slate-600">Не закрыто</p>
              <p className="text-sm font-bold">{stats.summary.openShiftCount}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-[10px] text-slate-600">Очередь</p>
              <p className="text-sm font-bold">{stats.actionQueue.length}</p>
            </div>
          </div>
        )}

        {stats && stats.actionQueue.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-medium text-slate-700">Что проверить</p>
            <ul className="space-y-1 text-xs">
              {stats.actionQueue.slice(0, 5).map((item) => (
                <li key={item.shiftId} className="flex flex-wrap justify-between gap-1">
                  <span>
                    {item.date} · {item.memberName}
                    {item.requiresSuperAdmin ? " · только супер-админ" : ""}
                    {!item.employeeSubmitted ? " · ждёт сотрудника" : ""}
                  </span>
                  <span className="text-slate-500">{item.previewAmount.toFixed(2)} Br</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {employees.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Сотрудники</span>
              <button
                type="button"
                className="text-xs text-lime-700 hover:underline"
                onClick={toggleAllMembers}
              >
                {allSelected ? "Снять все" : "Выбрать все"}
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
                    {e.branchName && (
                      <span className="text-xs text-slate-400">· {e.branchName}</span>
                    )}
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Пустой выбор — все сотрудники
            </p>
          </div>
        )}

        <button
          type="button"
          className={`${btnPrimary} mt-4`}
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Расчёт…" : "Рассчитать"}
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {report && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <p className="text-sm text-slate-500">Итого за период</p>
              <p className="text-2xl font-bold text-slate-900">
                {formatMoney(report.grandTotal.amount)} BYN
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>Смен: {report.grandTotal.shiftCount}</p>
              {report.grandTotal.panelMinutes > 0 && (
                <p>Пульт: {formatDurationMinutes(report.grandTotal.panelMinutes)}</p>
              )}
              {report.grandTotal.spotMinutes > 0 && (
                <p>Спот: {formatDurationMinutes(report.grandTotal.spotMinutes)}</p>
              )}
              {report.grandTotal.idleMinutes > 0 && (
                <p>Простой: {formatDurationMinutes(report.grandTotal.idleMinutes)}</p>
              )}
              {report.grandTotal.shiftMinutes > 0 &&
                report.grandTotal.panelMinutes === 0 && (
                  <p>Часы: {formatDurationMinutes(report.grandTotal.shiftMinutes)}</p>
                )}
            </div>
          </div>

          {monthlyLines.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="font-semibold text-slate-900">Оклады за период</h3>
              <p className="mt-1 text-xs text-slate-500">
                Подтвердите или скорректируйте месячный оклад
              </p>
              <div className="mt-3 space-y-3">
                {monthlyLines.map((line) => (
                  <div
                    key={line.memberId}
                    className="flex flex-wrap items-end gap-2 border-b border-slate-100 pb-3 last:border-0"
                  >
                    <div className="min-w-[10rem] flex-1">
                      <p className="text-sm font-medium">{line.memberName}</p>
                      <p className="text-xs text-slate-500">
                        По тарифу: {formatMoney(line.suggestedAmount)} BYN
                      </p>
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-500">К выплате</span>
                      <input
                        className={inputClass}
                        type="number"
                        min={0}
                        step={0.01}
                        value={monthlyDrafts[line.memberId] ?? ""}
                        onChange={(e) =>
                          setMonthlyDrafts((d) => ({
                            ...d,
                            [line.memberId]: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={saving}
                      className={btnPrimary}
                      onClick={() =>
                        void confirmMonthly(line.memberId, line.suggestedAmount)
                      }
                    >
                      Подтвердить
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {visibleMembers.length === 0 && !loading && (
            <p className="mt-4 text-sm text-slate-500">
              Нет закрытых или утверждённых смен за выбранный период
            </p>
          )}

          <div className="mt-4 space-y-2">
            {visibleMembers.map((block) => (
              <div
                key={block.memberId}
                className="rounded-lg border border-slate-100 overflow-hidden"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 bg-slate-50 px-3 py-2.5 text-left"
                  onClick={() =>
                    setExpandedMember((id) =>
                      id === block.memberId ? null : block.memberId,
                    )
                  }
                >
                  <div>
                    <p className="font-medium text-slate-900">{block.memberName}</p>
                    <p className="text-xs text-slate-500">
                      {block.branchName ?? "—"} · {block.totals.shiftCount}{" "}
                      {block.totals.shiftCount === 1 ? "смена" : "смен"}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-900">
                    {formatMoney(block.totals.amount)} BYN
                  </p>
                </button>

                {expandedMember === block.memberId && (
                  <div className="divide-y divide-slate-100">
                    {block.shifts.map((shift) => (
                      <div
                        key={shift.shiftId}
                        className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-800">
                            {new Date(shift.date + "T12:00:00").toLocaleDateString(
                              "ru-RU",
                              { weekday: "short", day: "numeric", month: "short" },
                            )}
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              {STATUS_LABEL[shift.status] ?? shift.status}
                            </span>
                          </p>
                          <p className="text-xs text-slate-500">{lineSummary(shift)}</p>
                          <p className="text-xs text-slate-400">
                            {shift.lines
                              .map((l) => `${l.label} ${formatMoney(l.amount)}`)
                              .join(" · ")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <p className="font-medium text-slate-900">
                            {formatMoney(shift.totalAmount)} BYN
                          </p>
                          <button
                            type="button"
                            className="text-xs text-lime-700 hover:underline"
                            onClick={() => openEdit(shift)}
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:underline"
                            onClick={() => void deleteShift(shift)}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                      Итого: пульт {formatDurationMinutes(block.totals.panelMinutes)}, спот{" "}
                      {formatDurationMinutes(block.totals.spotMinutes)}, простой{" "}
                      {formatDurationMinutes(block.totals.idleMinutes)}
                      {!block.shifts[0]?.isOperator &&
                        ` · ${formatDurationMinutes(block.totals.shiftMinutes)} на смене`}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {editForm && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/40 p-4 admin-desktop:items-center admin-desktop:justify-center">
          <div className="w-full max-w-md rounded-xl bg-white p-4 space-y-3">
            <h3 className="font-semibold">Редактировать смену</h3>
            <p className="text-xs text-slate-500">{editForm.date}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Начало</span>
                <input
                  type="time"
                  className={inputClass}
                  value={editForm.timeFrom}
                  onChange={(e) =>
                    setEditForm((f) => f && { ...f, timeFrom: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Конец</span>
                <input
                  type="time"
                  className={inputClass}
                  value={editForm.timeTo}
                  onChange={(e) =>
                    setEditForm((f) => f && { ...f, timeTo: e.target.value })
                  }
                />
              </label>
            </div>
            {editForm.isOperator && (
              <>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Пульт, мин</span>
                  <input
                    type="number"
                    className={inputClass}
                    value={editForm.panelOverride}
                    onChange={(e) =>
                      setEditForm((f) => f && { ...f, panelOverride: e.target.value })
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Простой, мин</span>
                  <input
                    type="number"
                    className={inputClass}
                    value={editForm.idleOverride}
                    onChange={(e) =>
                      setEditForm((f) => f && { ...f, idleOverride: e.target.value })
                    }
                  />
                </label>
              </>
            )}
            <textarea
              className={inputClass}
              rows={2}
              placeholder="Комментарий (обязательно)"
              value={editForm.comment}
              onChange={(e) =>
                setEditForm((f) => f && { ...f, comment: e.target.value })
              }
            />
            <div className="flex gap-2">
              <button
                type="button"
                className={`${btnSecondary} flex-1`}
                onClick={() => setEditForm(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className={`${btnPrimary} flex-1`}
                disabled={saving}
                onClick={() => void saveEdit()}
              >
                {saving ? "…" : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
