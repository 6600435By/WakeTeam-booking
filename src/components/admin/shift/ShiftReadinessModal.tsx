"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import type { ShiftReadinessPayload } from "@/lib/payroll/shift-readiness";
import type { ShiftData } from "./ShiftReportCard";
import {
  BRANCH_ADMIN_ROLE,
  BRANCH_MANAGER_ROLE,
  BRANCH_OPERATOR_ROLE,
  SUPER_ADMIN_ROLE,
} from "@/lib/admin-roles";

const ROLE_LABELS: Record<string, string> = {
  [BRANCH_OPERATOR_ROLE]: "Оператор",
  [BRANCH_ADMIN_ROLE]: "Админ",
  [BRANCH_MANAGER_ROLE]: "Управляющий",
  [SUPER_ADMIN_ROLE]: "Супер-админ",
};

const inputClass =
  "w-full min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-base sm:text-sm touch-manipulation";
const btn =
  "min-h-11 touch-manipulation rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50";
const btnPrimary = `${btn} bg-slate-900 text-white`;
const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-800`;
const btnIcon =
  "inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 touch-manipulation hover:bg-slate-50 disabled:opacity-50";

function currentMinskTime() {
  return new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Minsk",
  });
}

type MemberOption = { memberId: string; name: string; role: string };

type BranchOption = { id: string; name: string };

type ServiceOption = {
  id: string;
  name: string;
  kind: string;
  bookableFrom: string | null;
  bookableTo: string | null;
  isActive: boolean;
  isOnlineBookable: boolean;
  availableToday: boolean;
  workingToday: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  branchId: string;
  branchOptions?: BranchOption[];
  onBranchChange?: (branchId: string) => void;
  date: string;
  mode: "review" | "open";
  canEdit: boolean;
  canAddShift: boolean;
  canAddManager?: boolean;
  onShiftOpened?: (data: ShiftData) => void;
};

export function ShiftReadinessModal({
  open,
  onClose,
  branchId,
  branchOptions = [],
  onBranchChange,
  date,
  mode,
  canEdit,
  canAddShift,
  canAddManager = false,
  onShiftOpened,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [data, setData] = useState<ShiftReadinessPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [managers, setManagers] = useState<MemberOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [svcFrom, setSvcFrom] = useState("10:00");
  const [svcTo, setSvcTo] = useState("22:00");
  const [svcWorkingToday, setSvcWorkingToday] = useState(true);
  const [svcActive, setSvcActive] = useState(true);
  const [svcOnline, setSvcOnline] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<"operator" | "admin" | "manager">("operator");
  const [addMemberId, setAddMemberId] = useState("");
  const [addStaffIds, setAddStaffIds] = useState<string[]>([]);
  const [addAdminIds, setAddAdminIds] = useState<string[]>([]);
  const [addSaving, setAddSaving] = useState(false);
  const [editBranchHours, setEditBranchHours] = useState(false);
  const [branchFrom, setBranchFrom] = useState("10:00");
  const [branchTo, setBranchTo] = useState("22:00");
  const [editResourceId, setEditResourceId] = useState<string | null>(null);
  const [resFrom, setResFrom] = useState("10:00");
  const [resTo, setResTo] = useState("22:00");
  const [resWorking, setResWorking] = useState(true);
  const [editShiftId, setEditShiftId] = useState<string | null>(null);
  const [shiftFrom, setShiftFrom] = useState("10:00");
  const [shiftTo, setShiftTo] = useState("22:00");
  const [openShiftStart, setOpenShiftStart] = useState(currentMinskTime);
  const [openHandoffComment, setOpenHandoffComment] = useState("");
  const [previousHandoffText, setPreviousHandoffText] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  const showBranchPicker = branchOptions.length > 1 && onBranchChange;

  const loadServices = useCallback(async () => {
    if (!branchId || !canEdit) return;
    try {
      const q = new URLSearchParams({ branchId, date });
      const r = await fetch(`/api/admin/shift-readiness/services?${q}`);
      const d = await r.json();
      if (!r.ok) return;
      const list = (d.services ?? []) as ServiceOption[];
      setServices(list);
      setSelectedServiceId((prev) => {
        if (prev && list.some((s) => s.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch {
      /* ignore */
    }
  }, [branchId, date, canEdit]);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ branchId, date });
      const r = await fetch(`/api/admin/shift-readiness?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка загрузки");
      setData(d);
      if (d.branchPlannedWindow?.start) setBranchFrom(d.branchPlannedWindow.start);
      if (d.branchPlannedWindow?.end) setBranchTo(d.branchPlannedWindow.end);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [branchId, date]);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setAddOpen(false);
    setEditBranchHours(false);
    setEditResourceId(null);
    setEditShiftId(null);
    setOpenShiftStart(currentMinskTime());
    setOpenHandoffComment("");
    void load();
    void loadServices();
    const timer = window.setInterval(() => {
      void load();
    }, 30_000);
    void fetch(`/api/admin/shift-resources?branchId=${encodeURIComponent(branchId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.members) setMembers(d.members);
        if (d.managers) {
          setManagers(
            d.managers.map((m: { memberId: string; name: string }) => ({
              ...m,
              role: BRANCH_MANAGER_ROLE,
            })),
          );
        }
      })
      .catch(() => undefined);
    const q = new URLSearchParams({ branchId, shiftDate: date });
    void fetch(`/api/admin/shift-handoff?${q}`)
      .then(async (r) => {
        const d = await r.json();
        if (r.ok && d.existingComment) setPreviousHandoffText(d.existingComment);
        else setPreviousHandoffText(null);
      })
      .catch(() => setPreviousHandoffText(null));
    return () => window.clearInterval(timer);
  }, [open, branchId, date, load, loadServices]);

  useEffect(() => {
    const svc = services.find((s) => s.id === selectedServiceId);
    if (!svc) return;
    setSvcFrom(svc.bookableFrom ?? "10:00");
    setSvcTo(svc.bookableTo ?? "22:00");
    setSvcWorkingToday(svc.workingToday);
    setSvcActive(svc.isActive);
    setSvcOnline(svc.isOnlineBookable);
  }, [selectedServiceId, services]);

  async function patchShift(
    shiftId: string,
    body: Record<string, unknown>,
  ) {
    setSavingId(shiftId);
    setError("");
    try {
      const r = await fetch(`/api/admin/shift-schedule/${shiftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка сохранения");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSavingId(null);
    }
  }

  async function assignReverses(shiftId: string, plannedStaffIds: string[]) {
    await patchShift(shiftId, { plannedStaffIds });
  }

  async function removeShift(shiftId: string) {
    if (!confirm("Убрать сотрудника со смены?")) return;
    setSavingId(shiftId);
    setError("");
    try {
      const r = await fetch(`/api/admin/shift-schedule/${shiftId}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка удаления");
      setEditShiftId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSavingId(null);
    }
  }

  async function saveBranchHours() {
    setSavingId("branch-hours");
    setError("");
    try {
      const r = await fetch("/api/admin/shift-readiness/schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "branch-hours",
          branchId,
          date,
          timeFrom: branchFrom,
          timeTo: branchTo,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      setEditBranchHours(false);
      await load();
      await loadServices();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSavingId(null);
    }
  }

  async function saveResourceSchedule(staffId: string) {
    setSavingId(staffId);
    setError("");
    try {
      const r = await fetch("/api/admin/shift-readiness/schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          date,
          staffId,
          isWorking: resWorking,
          timeFrom: resFrom,
          timeTo: resTo,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      setEditResourceId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSavingId(null);
    }
  }

  async function addStaffShift() {
    if (!data) return;
    if (addKind === "operator") {
      if (!addMemberId || addStaffIds.length === 0) return;
    } else if (addKind === "manager") {
      if (!addMemberId) return;
    } else if (addAdminIds.length === 0) {
      return;
    }
    setAddSaving(true);
    setError("");
    try {
      const basePayload = {
        branchId,
        date,
        plannedStart: data.branchPlannedWindow.start ?? branchFrom,
        plannedEnd: data.branchPlannedWindow.end ?? branchTo,
      };

      if (addKind === "admin") {
        for (const memberId of addAdminIds) {
          const r = await fetch("/api/admin/shift-schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...basePayload, memberId }),
          });
          const d = await r.json();
          if (!r.ok) {
            const name = members.find((m) => m.memberId === memberId)?.name ?? memberId;
            throw new Error(d.error ? `${name}: ${d.error}` : "Ошибка");
          }
        }
        setAddAdminIds([]);
        await load();
        return;
      }

      const r = await fetch("/api/admin/shift-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...basePayload,
          memberId: addMemberId,
          ...(addStaffIds.length > 0 ? { plannedStaffIds: addStaffIds } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      setAddOpen(false);
      setAddMemberId("");
      setAddStaffIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setAddSaving(false);
    }
  }

  async function saveServiceSchedule() {
    if (!selectedServiceId) return;
    setSavingId(selectedServiceId);
    setError("");
    try {
      const r = await fetch("/api/admin/shift-readiness/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          date,
          serviceId: selectedServiceId,
          workingToday: svcWorkingToday,
          bookableFrom: svcFrom,
          bookableTo: svcTo,
          isActive: svcActive,
          isOnlineBookable: svcOnline,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      if (d.service) {
        setServices((prev) =>
          prev.map((s) => (s.id === d.service.id ? { ...s, ...d.service } : s)),
        );
      } else {
        await loadServices();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSavingId(null);
    }
  }

  async function startShift() {
    setOpening(true);
    setError("");
    const payload: Record<string, string> = { actualStart: openShiftStart };
    if (openHandoffComment.trim()) payload.handoffComment = openHandoffComment.trim();
    payload.branchId = branchId;
    try {
      const r = await fetch("/api/admin/work-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      onShiftOpened?.(d);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setOpening(false);
    }
  }

  function scrollToWarning(w: { shiftId?: string; staffId?: string }) {
    const key = w.shiftId ?? w.staffId;
    if (!key) return;
    cardRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function toggleAddStaffId(id: string) {
    setAddStaffIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAddAdminId(id: string) {
    setAddAdminIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleShiftStaffId(shiftId: string, current: string[], id: string) {
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    void assignReverses(shiftId, next);
  }

  function startEditResource(res: ShiftReadinessPayload["resources"][0]) {
    setEditResourceId(res.id);
    setResWorking(Boolean(res.scheduleToday?.isWorking));
    setResFrom(res.scheduleToday?.timeFrom ?? "10:00");
    setResTo(res.scheduleToday?.timeTo ?? "22:00");
  }

  function startEditShift(shift: ShiftReadinessPayload["staffOnShift"][0]) {
    setEditShiftId(shift.shiftId);
    setShiftFrom(shift.plannedStart ?? "10:00");
    setShiftTo(shift.plannedEnd ?? "22:00");
  }

  if (!open) return null;

  const allResources = data?.resources ?? [];
  const warnings = data?.warnings ?? [];
  const assignedMemberIds = new Set(data?.staffOnShift.map((s) => s.memberId) ?? []);
  const operatorMembers = members.filter((m) => m.role === BRANCH_OPERATOR_ROLE);
  const adminMembers = members.filter((m) => m.role === BRANCH_ADMIN_ROLE);
  const availableAdmins = adminMembers.filter((m) => !assignedMemberIds.has(m.memberId));
  const availableManagers = managers.filter((m) => !assignedMemberIds.has(m.memberId));
  const selectedService = services.find((s) => s.id === selectedServiceId) ?? null;
  const SERVICE_KIND_LABELS: Record<string, string> = { wake: "Вейк", sup: "SUP" };

  function renderStaffCard(shift: ShiftReadinessPayload["staffOnShift"][0]) {
    const hasWarn = warnings.some((w) => w.shiftId === shift.shiftId);
    const needsReverse =
      shift.role === BRANCH_OPERATOR_ROLE || shift.role === BRANCH_MANAGER_ROLE;
    const isEditing = editShiftId === shift.shiftId;

    return (
      <li
        key={shift.shiftId}
        ref={(el) => {
          cardRefs.current[shift.shiftId] = el;
        }}
        className={`rounded-lg border px-3 py-2 ${
          hasWarn ? "border-amber-300 bg-amber-50/50" : "border-slate-200"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-slate-900">{shift.memberName}</div>
            <div className="text-xs text-slate-500">
              {ROLE_LABELS[shift.role] ?? shift.role}
              {shift.plannedStart && shift.plannedEnd && !isEditing
                ? ` · ${shift.plannedStart}–${shift.plannedEnd}`
                : ""}
              {shift.status === "open" ? " · на смене" : ""}
            </div>
          </div>
          {canEdit && shift.status === "scheduled" && (
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                className={btnIcon}
                aria-label="Изменить время"
                disabled={savingId === shift.shiftId}
                onClick={() =>
                  isEditing ? setEditShiftId(null) : startEditShift(shift)
                }
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                className={`${btnIcon} border-red-200 text-red-600 hover:bg-red-50`}
                aria-label="Убрать со смены"
                disabled={savingId === shift.shiftId}
                onClick={() => void removeShift(shift.shiftId)}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )}
        </div>

        {isEditing && canEdit && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block flex-1 min-w-[100px]">
              <span className="mb-1 block text-xs text-slate-500">С</span>
              <input
                type="time"
                className={inputClass}
                value={shiftFrom}
                onChange={(e) => setShiftFrom(e.target.value)}
              />
            </label>
            <label className="block flex-1 min-w-[100px]">
              <span className="mb-1 block text-xs text-slate-500">До</span>
              <input
                type="time"
                className={inputClass}
                value={shiftTo}
                onChange={(e) => setShiftTo(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={btnPrimary}
              disabled={savingId === shift.shiftId}
              onClick={() =>
                void patchShift(shift.shiftId, {
                  plannedStart: shiftFrom,
                  plannedEnd: shiftTo,
                }).then(() => setEditShiftId(null))
              }
            >
              Сохранить
            </button>
          </div>
        )}

        {needsReverse && (
          <div className="mt-2">
            <span className="mb-1 block text-xs text-slate-500">Реверсы</span>
            {canEdit && shift.status === "scheduled" ? (
              <div className="flex flex-wrap gap-2">
                {allResources.map((r) => {
                  const checked = shift.plannedStaffIds.includes(r.id);
                  const disabled = savingId === shift.shiftId;
                  return (
                    <label
                      key={r.id}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs touch-manipulation ${
                        checked
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700"
                      } ${disabled ? "opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        disabled={disabled}
                        onChange={() =>
                          toggleShiftStaffId(shift.shiftId, shift.plannedStaffIds, r.id)
                        }
                      />
                      {r.name}
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-600">
                {shift.plannedStaffNames.length > 0
                  ? shift.plannedStaffNames.join(", ")
                  : "—"}
              </p>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-lg sm:max-w-lg sm:rounded-xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3">
          {step === 2 && mode === "open" ? (
            <button
              type="button"
              className="rounded-lg p-1 text-slate-600 hover:bg-slate-100"
              onClick={() => setStep(1)}
              aria-label="Назад"
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-slate-900">
              {step === 1 ? "Проверка перед сменой" : "Начать смену"}
            </h3>
            {mode === "open" && (
              <p className="text-xs text-slate-500">Шаг {step} из 2</p>
            )}
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {error && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          {step === 1 && (
            <>
              {showBranchPicker && (
                <label className="mb-3 block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Филиал</span>
                  <select
                    className={inputClass}
                    value={branchId}
                    onChange={(e) => onBranchChange?.(e.target.value)}
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

              {!loading && data && warnings.length > 0 && (
                <button
                  type="button"
                  className="mb-3 flex w-full items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 touch-manipulation"
                  onClick={() => scrollToWarning(warnings[0])}
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {warnings.length === 1
                      ? warnings[0].message
                      : `${warnings.length} проблем — нажмите, чтобы перейти`}
                  </span>
                </button>
              )}

              {!loading && data && (
                <>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    {editBranchHours && canEdit ? (
                      <div className="flex flex-1 flex-wrap items-end gap-2">
                        <label className="block flex-1 min-w-[90px]">
                          <span className="mb-1 block text-xs text-slate-500">С</span>
                          <input
                            type="time"
                            className={inputClass}
                            value={branchFrom}
                            onChange={(e) => setBranchFrom(e.target.value)}
                          />
                        </label>
                        <label className="block flex-1 min-w-[90px]">
                          <span className="mb-1 block text-xs text-slate-500">До</span>
                          <input
                            type="time"
                            className={inputClass}
                            value={branchTo}
                            onChange={(e) => setBranchTo(e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className={btnPrimary}
                          disabled={savingId === "branch-hours"}
                          onClick={() => void saveBranchHours()}
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={() => setEditBranchHours(false)}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-slate-500">
                          График филиала: {data.branchPlannedWindow.start ?? branchFrom}–
                          {data.branchPlannedWindow.end ?? branchTo}
                        </p>
                        {canEdit && (
                          <button
                            type="button"
                            className={btnIcon}
                            aria-label="Изменить график филиала"
                            onClick={() => setEditBranchHours(true)}
                          >
                            <Pencil className="size-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {canEdit && services.length > 0 && (
                    <section className="mb-4">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Услуги филиала
                      </h4>
                      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                        {services.map((s) => {
                          const selected = s.id === selectedServiceId;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium touch-manipulation ${
                                selected
                                  ? "border-slate-900 bg-slate-900 text-white"
                                  : s.availableToday
                                    ? "border-slate-200 bg-white text-slate-700"
                                    : "border-slate-200 bg-slate-100 text-slate-500"
                              }`}
                              onClick={() => setSelectedServiceId(s.id)}
                            >
                              {s.name}
                              {!s.availableToday ? " · выкл" : ""}
                            </button>
                          );
                        })}
                      </div>
                      {selectedService && (
                        <div className="space-y-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-900">{selectedService.name}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {SERVICE_KIND_LABELS[selectedService.kind] ?? selectedService.kind}
                            </span>
                            <span
                              className={
                                selectedService.availableToday
                                  ? "rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-800"
                                  : "rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                              }
                            >
                              {selectedService.availableToday ? "Доступна сегодня" : "Недоступна"}
                            </span>
                          </div>
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={svcWorkingToday}
                              onChange={(e) => setSvcWorkingToday(e.target.checked)}
                            />
                            Работает сегодня
                          </label>
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={svcActive}
                              onChange={(e) => setSvcActive(e.target.checked)}
                            />
                            Услуга активна
                          </label>
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={svcOnline}
                              onChange={(e) => setSvcOnline(e.target.checked)}
                            />
                            Онлайн-запись
                          </label>
                          <div className="flex flex-wrap items-end gap-2">
                            <label className="block flex-1 min-w-[90px]">
                              <span className="mb-1 block text-xs text-slate-500">Запись с</span>
                              <input
                                type="time"
                                className={inputClass}
                                value={svcFrom}
                                onChange={(e) => setSvcFrom(e.target.value)}
                              />
                            </label>
                            <label className="block flex-1 min-w-[90px]">
                              <span className="mb-1 block text-xs text-slate-500">Запись до</span>
                              <input
                                type="time"
                                className={inputClass}
                                value={svcTo}
                                onChange={(e) => setSvcTo(e.target.value)}
                              />
                            </label>
                          </div>
                          <button
                            type="button"
                            className={`${btnPrimary} w-full`}
                            disabled={savingId === selectedService.id}
                            onClick={() => void saveServiceSchedule()}
                          >
                            {savingId === selectedService.id ? "…" : "Сохранить услугу"}
                          </button>
                        </div>
                      )}
                    </section>
                  )}

                  <section className="mb-4">
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Ресурсы сегодня
                    </h4>
                    <ul className="space-y-2">
                      {data.resources.map((res) => {
                        const isEditing = editResourceId === res.id;
                        return (
                          <li
                            key={res.id}
                            ref={(el) => {
                              cardRefs.current[res.id] = el;
                            }}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-medium text-slate-900">{res.name}</div>
                              {canEdit && !isEditing && (
                                <button
                                  type="button"
                                  className={btnIcon}
                                  aria-label="Изменить график"
                                  onClick={() => startEditResource(res)}
                                >
                                  <Pencil className="size-4" />
                                </button>
                              )}
                            </div>
                            {isEditing ? (
                              <div className="mt-2 space-y-2">
                                <label className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={resWorking}
                                    onChange={(e) => setResWorking(e.target.checked)}
                                  />
                                  Работает сегодня
                                </label>
                                {resWorking && (
                                  <div className="flex flex-wrap items-end gap-2">
                                    <label className="block flex-1 min-w-[90px]">
                                      <span className="mb-1 block text-xs text-slate-500">С</span>
                                      <input
                                        type="time"
                                        className={inputClass}
                                        value={resFrom}
                                        onChange={(e) => setResFrom(e.target.value)}
                                      />
                                    </label>
                                    <label className="block flex-1 min-w-[90px]">
                                      <span className="mb-1 block text-xs text-slate-500">До</span>
                                      <input
                                        type="time"
                                        className={inputClass}
                                        value={resTo}
                                        onChange={(e) => setResTo(e.target.value)}
                                      />
                                    </label>
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    className={btnPrimary}
                                    disabled={savingId === res.id}
                                    onClick={() => void saveResourceSchedule(res.id)}
                                  >
                                    Сохранить
                                  </button>
                                  <button
                                    type="button"
                                    className={btnSecondary}
                                    onClick={() => setEditResourceId(null)}
                                  >
                                    Отмена
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                {res.scheduleToday ? (
                                  <span>
                                    {res.scheduleToday.timeFrom}–{res.scheduleToday.timeTo}
                                  </span>
                                ) : (
                                  <span>—</span>
                                )}
                                <span
                                  className={
                                    res.scheduleToday?.isWorking
                                      ? "rounded bg-green-100 px-1.5 py-0.5 text-green-800"
                                      : "rounded bg-slate-100 px-1.5 py-0.5 text-slate-600"
                                  }
                                >
                                  {res.scheduleToday?.isWorking ? "Работает" : "Не работает"}
                                </span>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Сотрудники на смене
                    </h4>
                    {data.staffOnShift.length === 0 ? (
                      <p className="text-sm text-slate-500">Никто не назначен на сегодня</p>
                    ) : (
                      <ul className="space-y-2">{data.staffOnShift.map(renderStaffCard)}</ul>
                    )}

                    {canEdit && (canAddShift || canAddManager) && (
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {canAddShift && (
                            <>
                              <button
                                type="button"
                                className={`${btnSecondary} flex items-center gap-1`}
                                onClick={() => {
                                  setAddKind("operator");
                                  setAddAdminIds([]);
                                  setAddOpen((v) => !v || addKind !== "operator");
                                }}
                              >
                                + Оператор
                                <ChevronDown
                                  className={`size-4 transition-transform ${
                                    addOpen && addKind === "operator" ? "rotate-180" : ""
                                  }`}
                                />
                              </button>
                              <button
                                type="button"
                                className={`${btnSecondary} flex items-center gap-1`}
                                onClick={() => {
                                  setAddKind("admin");
                                  setAddMemberId("");
                                  setAddStaffIds([]);
                                  setAddOpen((v) => !v || addKind !== "admin");
                                }}
                              >
                                + Админ
                                <ChevronDown
                                  className={`size-4 transition-transform ${
                                    addOpen && addKind === "admin" ? "rotate-180" : ""
                                  }`}
                                />
                              </button>
                            </>
                          )}
                          {canAddManager && (
                            <button
                              type="button"
                              className={`${btnSecondary} flex items-center gap-1`}
                              onClick={() => {
                                setAddKind("manager");
                                setAddAdminIds([]);
                                setAddMemberId("");
                                setAddStaffIds([]);
                                setAddOpen((v) => !v || addKind !== "manager");
                              }}
                            >
                              + Управляющий
                              <ChevronDown
                                className={`size-4 transition-transform ${
                                  addOpen && addKind === "manager" ? "rotate-180" : ""
                                }`}
                              />
                            </button>
                          )}
                        </div>
                        {addOpen && data && (
                          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            {addKind === "operator" || addKind === "manager" ? (
                              <>
                                <label className="block">
                                  <span className="mb-1 block text-xs text-slate-500">
                                    {addKind === "operator" ? "Оператор" : "Управляющий"}
                                  </span>
                                  <select
                                    className={inputClass}
                                    value={addMemberId}
                                    onChange={(e) => setAddMemberId(e.target.value)}
                                  >
                                    <option value="">Выберите</option>
                                    {(addKind === "operator" ? operatorMembers : availableManagers).map(
                                      (o) => (
                                        <option key={o.memberId} value={o.memberId}>
                                          {o.name}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </label>
                                <div>
                                  <span className="mb-1 block text-xs text-slate-500">
                                    Реверсы
                                    {addKind === "manager" && (
                                      <span className="text-slate-400"> — необязательно</span>
                                    )}
                                  </span>
                                  <div className="flex flex-wrap gap-2">
                                    {allResources.map((r) => {
                                      const checked = addStaffIds.includes(r.id);
                                      return (
                                        <label
                                          key={r.id}
                                          className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs touch-manipulation ${
                                            checked
                                              ? "border-slate-900 bg-slate-900 text-white"
                                              : "border-slate-200 bg-white text-slate-700"
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={checked}
                                            onChange={() => toggleAddStaffId(r.id)}
                                          />
                                          {r.name}
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div>
                                <span className="mb-1 block text-xs text-slate-500">
                                  Админы филиала — можно выбрать несколько
                                </span>
                                {availableAdmins.length === 0 ? (
                                  <p className="text-sm text-slate-500">
                                    Все админы уже назначены на сегодня
                                  </p>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    {availableAdmins.map((a) => {
                                      const checked = addAdminIds.includes(a.memberId);
                                      return (
                                        <label
                                          key={a.memberId}
                                          className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs touch-manipulation ${
                                            checked
                                              ? "border-slate-900 bg-slate-900 text-white"
                                              : "border-slate-200 bg-white text-slate-700"
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={checked}
                                            onChange={() => toggleAddAdminId(a.memberId)}
                                          />
                                          {a.name}
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                            <button
                              type="button"
                              className={`${btnPrimary} w-full`}
                              disabled={
                                addSaving ||
                                (addKind === "operator"
                                  ? !addMemberId || addStaffIds.length === 0
                                  : addKind === "manager"
                                    ? !addMemberId
                                    : addAdminIds.length === 0)
                              }
                              onClick={() => void addStaffShift()}
                            >
                              {addSaving
                                ? "…"
                                : addKind === "admin" && addAdminIds.length > 1
                                  ? `Добавить (${addAdminIds.length})`
                                  : "Добавить"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}

          {step === 2 && mode === "open" && (
            <div className="space-y-3">
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
                  rows={3}
                  value={openHandoffComment}
                  onChange={(e) => setOpenHandoffComment(e.target.value)}
                  placeholder="Необязательно"
                />
              </label>
            </div>
          )}
        </div>

        <div
          className="flex shrink-0 flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:justify-end"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <button type="button" className={`${btnSecondary} w-full sm:w-auto`} onClick={onClose}>
            Позже
          </button>
          {step === 1 && mode === "open" && (
            <button
              type="button"
              className={`${btnPrimary} w-full sm:w-auto`}
              disabled={loading}
              onClick={() => setStep(2)}
            >
              Далее: открыть смену
            </button>
          )}
          {step === 1 && mode === "review" && (
            <button
              type="button"
              className={`${btnPrimary} w-full sm:w-auto`}
              disabled={loading}
              onClick={onClose}
            >
              Готово
            </button>
          )}
          {step === 2 && mode === "open" && (
            <button
              type="button"
              className={`${btnPrimary} w-full sm:w-auto`}
              disabled={opening}
              onClick={() => void startShift()}
            >
              {opening ? "…" : "Открыть смену"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function formatReadinessSummary(data: ShiftReadinessPayload): string {
  const openCount = data.staffOnShift.filter((s) => s.status === "open").length;
  const scheduledCount = data.staffOnShift.filter((s) => s.status === "scheduled").length;
  const parts = [
    `${data.resources.filter((r) => r.scheduleToday?.isWorking).length} реверс.`,
    openCount > 0
      ? `${openCount} на смене`
      : scheduledCount > 0
        ? `${scheduledCount} по графику`
        : "0 на смене",
  ];
  if (data.warnings.length > 0) {
    parts.push(`${data.warnings.length} предупр.`);
  }
  return parts.join(" · ");
}
