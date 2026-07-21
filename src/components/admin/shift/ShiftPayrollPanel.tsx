"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatDurationMinutes, formatMoney } from "@/lib/payroll/shift-summary";
import { periodLast15Days } from "@/lib/date-ranges";
import {
  unifiedShiftStatusLabel,
  type UnifiedMemberBlock,
  type UnifiedShiftRow,
} from "@/lib/payroll/unified-payroll";
import type { PayrollMonthlyLine } from "@/lib/payroll/payroll-stats";
import { useSuperAdminBranchOptional } from "@/components/admin/SuperAdminBranchProvider";
import { DatePickerField } from "@/components/admin/DatePickerField";
import { ShiftReportCard, type ShiftData } from "./ShiftReportCard";
import { useShiftPayrollActions } from "./useShiftPayrollActions";

type Employee = {
  memberId: string;
  name: string;
  role: string;
  branchId: string | null;
  branchName: string | null;
};

type Branch = { id: string; name: string };

type PayrollStatsResponse = {
  from: string;
  to: string;
  summary: {
    approvedAmount: number;
    pendingAmount: number;
    openShiftCount: number;
    closedShiftCount: number;
  };
  unifiedMembers: UnifiedMemberBlock[];
  monthlyLines: PayrollMonthlyLine[];
  employees: Employee[];
  branches: Branch[];
  grandTotal: { amount: number; shiftCount: number };
  pendingGrandTotal: { amount: number; shiftCount: number };
};

type Props = {
  isSuperAdmin?: boolean;
  isBranchManager?: boolean;
  isBranchAdmin?: boolean;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";
const btn =
  "rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 touch-manipulation";
const btnPrimary = `${btn} bg-slate-900 text-white`;
const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-800`;

function isoToTimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function shiftStatusClass(row: UnifiedShiftRow, periodTo: string): string {
  if (row.status === "approved") return "bg-emerald-100 text-emerald-800";
  if (row.status === "open") {
    return row.date < periodTo
      ? "bg-red-100 text-red-800"
      : "bg-blue-100 text-blue-800";
  }
  if (!row.flags.employeeSubmitted) return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-700";
}

function lineSummary(shift: UnifiedShiftRow): string {
  if (!shift.isOperator) return formatDurationMinutes(shift.shiftMinutes);
  return [
    `пульт ${formatDurationMinutes(shift.panelMinutes)}`,
    `спот ${formatDurationMinutes(shift.spotMinutes)}`,
    `простой ${formatDurationMinutes(shift.idleMinutes)}`,
  ].join(" · ");
}

function canApproveShift(
  row: UnifiedShiftRow,
  isSuperAdmin: boolean,
): boolean {
  if (row.status === "approved") return false;
  if (row.flags.requiresSuperAdmin) return isSuperAdmin;
  return true;
}

export function ShiftPayrollPanel({
  isSuperAdmin = false,
  isBranchManager = false,
  isBranchAdmin = false,
}: Props) {
  const superBranch = useSuperAdminBranchOptional();
  const defaultPeriod = periodLast15Days();
  const [from, setFrom] = useState(defaultPeriod.from);
  const [to, setTo] = useState(defaultPeriod.to);
  const [branchId, setBranchId] = useState("");
  const [memberFilter, setMemberFilter] = useState("");
  const [data, setData] = useState<PayrollStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [detailShiftId, setDetailShiftId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<ShiftData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [monthlyDrafts, setMonthlyDrafts] = useState<Record<string, string>>({});
  const [editDraft, setEditDraft] = useState({
    timeFrom: "",
    timeTo: "",
    panelOverride: "",
    idleOverride: "",
    comment: "",
  });
  const [approveComment, setApproveComment] = useState("Проверено");

  const {
    saving,
    error,
    setError,
    approveShift,
    saveCorrection,
    deleteShift,
    loadShiftDetail,
    confirmMonthly,
  } = useShiftPayrollActions();

  useEffect(() => {
    if (superBranch?.branchPickerMode && superBranch.branchId) {
      setBranchId((prev) => prev || superBranch.branchId);
    }
  }, [superBranch?.branchPickerMode, superBranch?.branchId]);

  const branchOptions = useMemo(() => {
    if (superBranch?.branches.length) return superBranch.branches;
    return data?.branches ?? [];
  }, [superBranch?.branches, data?.branches]);

  const showBranchPicker = branchOptions.length > 0 && Boolean(superBranch?.branchPickerMode);
  const reportView = isSuperAdmin || isBranchManager ? "manager" : "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ from, to });
      if (branchId) q.set("branchId", branchId);
      if (memberFilter) q.set("memberIds", memberFilter);
      const r = await fetch(`/api/admin/payroll-stats?${q}`);
      const d = (await r.json()) as PayrollStatsResponse & { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Ошибка загрузки");
      setData(d);
      const drafts: Record<string, string> = {};
      for (const line of d.monthlyLines ?? []) {
        drafts[line.memberId] = String(line.confirmedAmount ?? line.suggestedAmount ?? "");
      }
      setMonthlyDrafts(drafts);
      setExpandedMembers((prev) => {
        if (prev.size > 0) return prev;
        const first = d.unifiedMembers[0]?.memberId;
        return first ? new Set([first]) : new Set();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [from, to, branchId, memberFilter, setError]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [load]);

  const members = data?.unifiedMembers ?? [];
  const employees = data?.employees ?? [];

  function toggleMember(memberId: string) {
    setExpandedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  function startEdit(shift: UnifiedShiftRow) {
    setEditingShiftId(shift.shiftId);
    setDetailShiftId(null);
    setDetailData(null);
    setEditDraft({
      timeFrom: isoToTimeInput(shift.actualStart),
      timeTo: isoToTimeInput(shift.actualEnd),
      panelOverride: shift.isOperator ? String(shift.panelMinutes) : "",
      idleOverride: shift.isOperator ? String(shift.idleMinutes) : "",
      comment: "",
    });
  }

  async function openDetail(shiftId: string) {
    if (detailShiftId === shiftId) {
      setDetailShiftId(null);
      setDetailData(null);
      return;
    }
    setEditingShiftId(null);
    setDetailShiftId(shiftId);
    setDetailLoading(true);
    const detail = await loadShiftDetail(shiftId);
    setDetailData(detail);
    setDetailLoading(false);
  }

  async function handleApprove(shift: UnifiedShiftRow) {
    const closeIfOpen = shift.status === "open";
    const ok = await approveShift(shift.shiftId, approveComment.trim() || "Проверено", closeIfOpen);
    if (ok) await load();
  }

  async function handleSaveEdit(shift: UnifiedShiftRow, approveAfter: boolean) {
    const ok = await saveCorrection({
      shiftId: shift.shiftId,
      date: shift.date,
      isOperator: shift.isOperator,
      timeFrom: editDraft.timeFrom,
      timeTo: editDraft.timeTo,
      panelOverride: editDraft.panelOverride,
      idleOverride: editDraft.idleOverride,
      comment: editDraft.comment,
      closeIfOpen: shift.status === "open",
      approveAfter,
    });
    if (ok) {
      setEditingShiftId(null);
      await load();
    }
  }

  async function handleDelete(shift: UnifiedShiftRow, memberName: string) {
    const ok = await deleteShift(shift.shiftId, memberName, shift.date);
    if (ok) await load();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Период расчёта</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DatePickerField label="С" value={from} max={to} onChange={setFrom} className={inputClass} />
          <DatePickerField label="По" value={to} min={from} onChange={setTo} className={inputClass} />
          {showBranchPicker && (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-slate-500">Филиал</span>
              <select
                className={inputClass}
                value={branchId}
                onChange={(e) => {
                  const id = e.target.value;
                  setBranchId(id);
                  setMemberFilter("");
                  if (superBranch?.branchPickerMode && id) superBranch.setBranchId(id);
                }}
              >
                <option value="">Все филиалы</option>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {employees.length > 0 && (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-slate-500">Сотрудник</span>
              <select
                className={inputClass}
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
              >
                <option value="">Все сотрудники</option>
                {employees.map((e) => (
                  <option key={e.memberId} value={e.memberId}>
                    {e.name}
                    {e.branchName ? ` · ${e.branchName}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {data && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div className="rounded-lg bg-emerald-50 p-2">
              <p className="text-[10px] text-emerald-800">К выплате</p>
              <p className="text-sm font-bold text-emerald-950">
                {data.summary.approvedAmount.toFixed(2)} BYN
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 p-2">
              <p className="text-[10px] text-amber-800">На проверке</p>
              <p className="text-sm font-bold text-amber-950">
                {data.pendingGrandTotal.amount.toFixed(2)} BYN
              </p>
              <p className="text-[10px] text-amber-700">
                {data.summary.closedShiftCount} смен
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-[10px] text-slate-600">Не закрыто</p>
              <p className="text-sm font-bold">{data.summary.openShiftCount}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-[10px] text-slate-600">Смен в периоде</p>
              <p className="text-sm font-bold">
                {members.reduce((acc, m) => acc + m.totals.shiftCount, 0)}
              </p>
            </div>
          </div>
        )}

        {loading && <p className="mt-3 text-sm text-slate-500">Загрузка…</p>}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {data && (data.monthlyLines?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-900">Оклады за период</h3>
          <div className="mt-3 space-y-3">
            {data.monthlyLines.map((line) => (
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
                      setMonthlyDrafts((d) => ({ ...d, [line.memberId]: e.target.value }))
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={saving}
                  className={btnPrimary}
                  onClick={() => {
                    const raw = monthlyDrafts[line.memberId] ?? String(line.suggestedAmount);
                    void confirmMonthly({
                      memberId: line.memberId,
                      periodFrom: from,
                      periodTo: to,
                      confirmedAmount: Number(raw),
                    }).then((ok) => {
                      if (ok) void load();
                    });
                  }}
                >
                  Подтвердить
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <p className="text-sm text-slate-500">Итого за период</p>
              <p className="text-2xl font-bold text-slate-900">
                {formatMoney(
                  data.summary.approvedAmount + data.pendingGrandTotal.amount,
                )}{" "}
                BYN
              </p>
              <p className="text-xs text-slate-500">
                утверждено {formatMoney(data.summary.approvedAmount)} · ожидает{" "}
                {formatMoney(data.pendingGrandTotal.amount)}
              </p>
            </div>
            <label className="block min-w-[12rem]">
              <span className="mb-1 block text-xs text-slate-500">Комментарий при утверждении</span>
              <input
                className={inputClass}
                value={approveComment}
                onChange={(e) => setApproveComment(e.target.value)}
              />
            </label>
          </div>

          {members.length === 0 && !loading && (
            <p className="text-sm text-slate-500">Нет смен за выбранный период</p>
          )}

          <div className="space-y-3">
            {members.map((block) => {
              const expanded = expandedMembers.has(block.memberId);
              const totalAmount = block.totals.approvedAmount + block.totals.pendingAmount;
              return (
                <div
                  key={block.memberId}
                  className="overflow-hidden rounded-lg border border-slate-200"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 bg-slate-50 px-3 py-3 text-left"
                    onClick={() => toggleMember(block.memberId)}
                  >
                    {expanded ? (
                      <ChevronDown className="size-4 shrink-0 text-slate-500" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-slate-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{block.memberName}</p>
                        {block.totals.needsActionCount > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                            нужно действие · {block.totals.needsActionCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {block.branchName ?? "—"} · {block.totals.shiftCount}{" "}
                        {block.totals.shiftCount === 1 ? "смена" : "смен"}
                        {block.totals.openCount > 0
                          ? ` · ${block.totals.openCount} не закрыта`
                          : ""}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        утверждено {formatMoney(block.totals.approvedAmount)} · ожидает{" "}
                        {formatMoney(block.totals.pendingAmount)}
                      </p>
                    </div>
                    <p className="shrink-0 text-lg font-bold text-slate-900">
                      {formatMoney(totalAmount)} BYN
                    </p>
                  </button>

                  {expanded && (
                    <div className="divide-y divide-slate-100 border-t border-slate-100">
                      {block.shifts.map((shift) => (
                        <div key={shift.shiftId} className="px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-slate-800">
                                  {new Date(shift.date + "T12:00:00").toLocaleDateString(
                                    "ru-RU",
                                    { weekday: "short", day: "numeric", month: "short" },
                                  )}
                                </p>
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${shiftStatusClass(shift, to)}`}
                                >
                                  {unifiedShiftStatusLabel(shift, to)}
                                </span>
                                {shift.isPreview && (
                                  <span className="text-[10px] text-slate-400">превью</span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-slate-500">{lineSummary(shift)}</p>
                              <p className="text-xs text-slate-400">
                                {shift.lines
                                  .map((l) => `${l.label} ${formatMoney(l.amount)}`)
                                  .join(" · ")}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <p className="font-semibold text-slate-900">
                                {formatMoney(shift.totalAmount)} BYN
                              </p>
                              <div className="flex flex-wrap justify-end gap-1">
                                {canApproveShift(shift, isSuperAdmin) &&
                                  shift.status !== "approved" && (
                                    <button
                                      type="button"
                                      className={btnPrimary}
                                      disabled={saving}
                                      onClick={() => void handleApprove(shift)}
                                    >
                                      {shift.status === "open"
                                        ? "Закрыть и утвердить"
                                        : "Утвердить"}
                                    </button>
                                  )}
                                <button
                                  type="button"
                                  className={btnSecondary}
                                  onClick={() => startEdit(shift)}
                                >
                                  Изменить
                                </button>
                                <button
                                  type="button"
                                  className={btnSecondary}
                                  onClick={() => void openDetail(shift.shiftId)}
                                >
                                  {detailShiftId === shift.shiftId ? "Скрыть" : "Детали"}
                                </button>
                                {(isSuperAdmin || isBranchManager || isBranchAdmin) && (
                                  <button
                                    type="button"
                                    className="text-xs text-red-600 hover:underline"
                                    onClick={() => void handleDelete(shift, block.memberName)}
                                  >
                                    Удалить
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {editingShiftId === shift.shiftId && (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <label className="block">
                                  <span className="mb-1 block text-xs text-slate-500">Начало</span>
                                  <input
                                    type="time"
                                    className={inputClass}
                                    value={editDraft.timeFrom}
                                    onChange={(e) =>
                                      setEditDraft((d) => ({ ...d, timeFrom: e.target.value }))
                                    }
                                  />
                                </label>
                                <label className="block">
                                  <span className="mb-1 block text-xs text-slate-500">Конец</span>
                                  <input
                                    type="time"
                                    className={inputClass}
                                    value={editDraft.timeTo}
                                    onChange={(e) =>
                                      setEditDraft((d) => ({ ...d, timeTo: e.target.value }))
                                    }
                                  />
                                </label>
                              </div>
                              {shift.isOperator && (
                                <div className="grid grid-cols-2 gap-2">
                                  <label className="block">
                                    <span className="mb-1 block text-xs text-slate-500">
                                      Пульт, мин
                                    </span>
                                    <input
                                      type="number"
                                      className={inputClass}
                                      value={editDraft.panelOverride}
                                      onChange={(e) =>
                                        setEditDraft((d) => ({
                                          ...d,
                                          panelOverride: e.target.value,
                                        }))
                                      }
                                    />
                                  </label>
                                  <label className="block">
                                    <span className="mb-1 block text-xs text-slate-500">
                                      Простой, мин
                                    </span>
                                    <input
                                      type="number"
                                      className={inputClass}
                                      value={editDraft.idleOverride}
                                      onChange={(e) =>
                                        setEditDraft((d) => ({
                                          ...d,
                                          idleOverride: e.target.value,
                                        }))
                                      }
                                    />
                                  </label>
                                </div>
                              )}
                              <textarea
                                className={inputClass}
                                rows={2}
                                placeholder="Комментарий (обязательно)"
                                value={editDraft.comment}
                                onChange={(e) =>
                                  setEditDraft((d) => ({ ...d, comment: e.target.value }))
                                }
                              />
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className={btnSecondary}
                                  onClick={() => setEditingShiftId(null)}
                                >
                                  Отмена
                                </button>
                                <button
                                  type="button"
                                  className={btnSecondary}
                                  disabled={saving}
                                  onClick={() => void handleSaveEdit(shift, false)}
                                >
                                  Сохранить
                                </button>
                                {shift.status !== "approved" && (
                                  <button
                                    type="button"
                                    className={btnPrimary}
                                    disabled={saving}
                                    onClick={() => void handleSaveEdit(shift, true)}
                                  >
                                    Сохранить и утвердить
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {detailShiftId === shift.shiftId && (
                            <div className="mt-3">
                              {detailLoading && (
                                <p className="text-sm text-slate-500">Загрузка деталей…</p>
                              )}
                              {!detailLoading && detailData && (
                                <ShiftReportCard
                                  data={detailData}
                                  view={reportView}
                                  highlightedMemberId={block.memberId}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
