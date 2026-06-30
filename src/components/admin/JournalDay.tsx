"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppointmentModal } from "./AppointmentModal";
import { ClientPhoneSearch, type ClientLookupAppointment } from "./ClientPhoneSearch";
import { JournalShiftBanner } from "./shift/JournalShiftBanner";
import { JournalGrid } from "./JournalGrid";
import {
  JournalGridStepPicker,
  loadJournalGridStep,
  saveJournalGridStep,
} from "./JournalGridStepPicker";
import {
  JournalGridZoomButtons,
  loadJournalGridScale,
  saveJournalGridScale,
} from "./JournalGridScalePicker";
import { JournalResourceToggle } from "./JournalResourceToggle";
import {
  loadJournalResourceKind,
  matchesResourceKind,
  saveJournalResourceKind,
  type JournalResourceKind,
} from "@/lib/journal-resources";
import { StatusBadge, StatusLegend } from "./StatusBadge";
import { cancelReasonLabel, JOURNAL_HIDDEN_STATUSES } from "@/lib/appointment-status";
import { groupConsecutiveClientAppointments } from "@/lib/calendar-grid";
import {
  deleteGroupAppointments,
  saveAppointmentEdit,
  type GroupApptRef,
} from "@/lib/admin/appointment-group-client";
import { periodToday, periodWeek } from "@/lib/date-ranges";
import { formatDateKey, formatTimeMinsk, weekdayMinsk } from "@/lib/time";
import type { JournalGridStep } from "@/lib/calendar-grid";
import type { JournalGridScale } from "@/lib/journal-grid-scale";
import { cn } from "@/lib/utils";
import { useAdminViewport } from "./AdminViewportContext";
import { journalStaffDisplayName } from "@/lib/journal-staff-label";
import {
  loadAppointmentsListAction,
  loadCalendarDayAction,
  type CalendarDayPayload,
} from "@/app/admin/(protected)/journal/actions";

type StaffRow = {
  id: string;
  name: string;
  kind: string;
  branchId: string;
  schedules: { weekday: number; timeFrom: string; timeTo: string; isWorking: boolean }[];
};

type Appointment = {
  id: string;
  publicNumber: number;
  startAt: string;
  endAt: string;
  status: string;
  price: number;
  durationMinutes: number;
  comment: string | null;
  membershipId?: string | null;
  paymentMethod?: string | null;
  cancelReason?: string | null;
  branchId: string;
  client: { firstName: string | null; lastName: string | null; phone: string };
  service: { id: string; name: string };
  staff: { id: string; name: string };
};

type Branch = { id: string; name: string };

type ModalInitial = {
  branchId?: string;
  serviceId?: string;
  staffId?: string;
  staffName?: string;
  startAt?: string;
  durationMinutes?: number;
  firstName?: string;
  lastName?: string;
  phone?: string;
  status?: string;
  comment?: string;
  membershipId?: string | null;
  paymentMethod?: string | null;
  totalPrice?: number;
  appointmentGroup?: GroupApptRef[];
};

function todayStr() {
  return formatDateKey(new Date());
}

function formatDateTitle(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });
}

function formatDateTitleShort(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    weekday: "short",
  });
}

function shiftDateStr(dateStr: string, days: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return formatDateKey(d);
}

function isHiddenFromJournal(status: string) {
  return (JOURNAL_HIDDEN_STATUSES as readonly string[]).includes(status);
}

function findAppointmentGroup(
  appt: Appointment,
  all: Appointment[],
): Appointment[] {
  const sameStaff = all.filter((a) => a.staff.id === appt.staff.id);
  const blocks = groupConsecutiveClientAppointments(sameStaff);
  const block = blocks.find((b) =>
    b.appointments.some((item) => item.id === appt.id),
  );
  return block?.appointments ?? [appt];
}

function groupSpanMinutes(group: Appointment[]): number {
  if (!group.length) return 0;
  if (group.length === 1) return group[0].durationMinutes;
  const end = group.reduce(
    (max, a) => (new Date(a.endAt) > new Date(max) ? a.endAt : max),
    group[0].endAt,
  );
  return Math.round(
    (new Date(end).getTime() - new Date(group[0].startAt).getTime()) / 60_000,
  );
}

function toGroupRefs(group: Appointment[]): GroupApptRef[] {
  return group.map((a) => ({
    id: a.id,
    startAt: a.startAt,
    durationMinutes: a.durationMinutes,
    price: a.price,
  }));
}

type JournalDayInitial = CalendarDayPayload & { branchId?: string };

function journalInitialState(initial?: JournalDayInitial) {
  if (!initial) {
    return {
      date: todayStr(),
      branchId: "",
      staff: [] as StaffRow[],
      appointments: [] as Appointment[],
      branches: [] as Branch[],
      isSuperAdmin: true,
      loading: true,
    };
  }

  return {
    date: initial.date,
    branchId: initial.branchId ?? "",
    staff: (initial.staff ?? []) as StaffRow[],
    appointments: (initial.appointments ?? []) as Appointment[],
    branches: initial.branches ?? [],
    isSuperAdmin: initial.admin?.isSuperAdmin ?? true,
    loading: false,
  };
}

export function JournalDay({ initial }: { initial?: JournalDayInitial }) {
  const boot = journalInitialState(initial);
  const [date, setDate] = useState(boot.date);
  const [branchId, setBranchId] = useState(boot.branchId);
  const [staff, setStaff] = useState<StaffRow[]>(boot.staff);
  const [appointments, setAppointments] = useState<Appointment[]>(boot.appointments);
  const [listRecords, setListRecords] = useState<Appointment[]>([]);
  const [listFrom, setListFrom] = useState(() => periodToday().from);
  const [listTo, setListTo] = useState(() => periodToday().to);
  const [listLoading, setListLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>(boot.branches);
  const [loading, setLoading] = useState(boot.loading);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [editGroup, setEditGroup] = useState<Appointment[] | null>(null);
  const [modalInitial, setModalInitial] = useState<ModalInitial>({});
  const [isSuperAdmin, setIsSuperAdmin] = useState(boot.isSuperAdmin);
  const [skipInitialLoad, setSkipInitialLoad] = useState(Boolean(initial));
  const [gridStep, setGridStep] = useState<JournalGridStep>(15);
  const [gridScale, setGridScale] = useState<JournalGridScale>(1);
  const [resourceKind, setResourceKind] = useState<JournalResourceKind>("all");
  const [periodListOpen, setPeriodListOpen] = useState(false);
  const [hideInactiveColumns, setHideInactiveColumns] = useState(true);
  const viewport = useAdminViewport();
  const isMobile = viewport === "mobile";
  const showGrid = !isMobile;
  const fillGridViewport = showGrid;

  useEffect(() => {
    setGridStep(loadJournalGridStep());
    setGridScale(loadJournalGridScale());
  }, []);

  useEffect(() => {
    if (!branchId) {
      setResourceKind("all");
      return;
    }
    setResourceKind(loadJournalResourceKind(branchId));
  }, [branchId]);

  function handleResourceKindChange(kind: JournalResourceKind) {
    setResourceKind(kind);
    if (branchId) saveJournalResourceKind(branchId, kind);
  }

  function handleGridStepChange(step: JournalGridStep) {
    setGridStep(step);
    saveJournalGridStep(step);
  }

  function handleGridScaleChange(scale: JournalGridScale) {
    setGridScale(scale);
    saveJournalGridScale(scale);
  }

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    setError("");

    try {
      const result = await loadCalendarDayAction(date, branchId || undefined);
      if (!result.ok) {
        setError(result.error);
        if (!silent) {
          setStaff([]);
          setAppointments([]);
          setBranches([]);
        }
        return;
      }

      const d = result.data;
      setStaff((d.staff ?? []) as StaffRow[]);
      setAppointments((d.appointments ?? []) as Appointment[]);
      setBranches(d.branches ?? []);

      if (d.admin) {
        setIsSuperAdmin(d.admin.isSuperAdmin);
      }

      setBranchId((current) => {
        if (d.admin && !d.admin.isSuperAdmin && d.admin.branchId) {
          return d.admin.branchId;
        }
        if (!current && d.branches?.[0]?.id) {
          return d.branches[0].id;
        }
        return current;
      });
    } catch {
      setError("Ошибка при загрузке журнала");
      if (!silent) {
        setStaff([]);
        setAppointments([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [date, branchId]);

  const loadList = useCallback(async () => {
    if (listFrom > listTo) return;
    setListLoading(true);
    try {
      const result = await loadAppointmentsListAction(
        listFrom,
        listTo,
        branchId || undefined,
      );
      if (result.ok) {
        setListRecords((result.appointments ?? []) as Appointment[]);
      }
    } catch {
      setListRecords([]);
    } finally {
      setListLoading(false);
    }
  }, [listFrom, listTo, branchId]);

  useEffect(() => {
    if (skipInitialLoad) {
      setSkipInitialLoad(false);
      return;
    }
    void load();
  }, [load, skipInitialLoad]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  function refreshAll() {
    void load();
    void loadList();
  }

  const wd = weekdayMinsk(date);

  const staffKindById = useMemo(
    () => new Map(staff.map((s) => [s.id, s.kind])),
    [staff],
  );

  const sortedAppointments = useMemo(
    () =>
      [...appointments]
        .filter((a) =>
          matchesResourceKind(staffKindById.get(a.staff.id) ?? "", resourceKind),
        )
        .sort(
          (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
        ),
    [appointments, resourceKind, staffKindById],
  );

  const filteredListRecords = useMemo(
    () =>
      listRecords.filter((a) =>
        matchesResourceKind(staffKindById.get(a.staff.id) ?? "", resourceKind),
      ),
    [listRecords, resourceKind, staffKindById],
  );

  function openNew(initial: ModalInitial = {}) {
    setEditAppt(null);
    setEditGroup(null);
    setModalInitial({
      branchId: branchId || branches[0]?.id,
      ...initial,
    });
    setModalOpen(true);
  }

  function openEdit(appt: Appointment, group?: Appointment[]) {
    const resolved =
      group && group.length > 0
        ? group
        : findAppointmentGroup(appt, appointments);
    setEditAppt(appt);
    setEditGroup(resolved.length > 1 ? resolved : null);
    setModalInitial({});
    setModalOpen(true);
  }

  function openEditFromSearch(appt: ClientLookupAppointment) {
    const full = appt as Appointment;
    setEditAppt(full);
    setEditGroup(null);
    setModalInitial({});
    setModalOpen(true);
  }

  const modalProps: ModalInitial = editAppt
    ? {
        branchId: editAppt.branchId,
        serviceId: editAppt.service.id,
        staffId: editAppt.staff.id,
        staffName: editAppt.staff.name,
        startAt: (editGroup ?? [editAppt])[0].startAt,
        durationMinutes: editGroup
          ? groupSpanMinutes(editGroup)
          : editAppt.durationMinutes,
        firstName: editAppt.client.firstName ?? "",
        lastName: editAppt.client.lastName ?? "",
        phone: editAppt.client.phone,
        status: editAppt.status,
        comment: editAppt.comment ?? "",
        membershipId: editAppt.membershipId ?? null,
        paymentMethod: editAppt.paymentMethod ?? null,
        totalPrice: editGroup
          ? editGroup.reduce((sum, a) => sum + a.price, 0)
          : editAppt.price,
        appointmentGroup: editGroup ? toGroupRefs(editGroup) : undefined,
      }
    : modalInitial;

  return (
    <div className="relative">
      <JournalShiftBanner />
      {isMobile ? (
        <>
          <div className="journal-mobile-toolbar">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDate((d) => shiftDateStr(d, -1))}
                className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-slate-300 bg-white text-lg text-slate-600 active:bg-slate-100"
                aria-label="Предыдущий день"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setDate(todayStr())}
                className="min-w-0 flex-1 touch-manipulation rounded-lg border border-slate-300 bg-white px-2 py-2 text-center active:bg-slate-100"
              >
                <span className="block text-sm font-semibold text-slate-900">
                  {formatDateTitleShort(date)}
                </span>
                {date !== todayStr() && (
                  <span className="block text-[11px] text-lime-700">↩ сегодня</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setDate((d) => shiftDateStr(d, 1))}
                className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-slate-300 bg-white text-lg text-slate-600 active:bg-slate-100"
                aria-label="Следующий день"
              >
                ›
              </button>
            </div>

            <label className="mt-2 block">
              <span className="sr-only">Дата</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 w-full touch-manipulation rounded-lg border border-slate-300 bg-white px-3 text-base"
              />
            </label>

            {isSuperAdmin ? (
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={branches.length === 0}
                className="mt-2 h-11 w-full touch-manipulation rounded-lg border border-slate-300 bg-white px-3 text-base disabled:bg-slate-100"
              >
                {branches.length === 0 ? (
                  <option value="">{loading ? "Загрузка…" : "Нет филиалов"}</option>
                ) : (
                  branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))
                )}
              </select>
            ) : (
              <div className="mt-2 flex h-11 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
                {branches.find((b) => b.id === branchId)?.name ??
                  branches[0]?.name ??
                  (loading ? "Загрузка…" : "Филиал…")}
              </div>
            )}

            <div className="mt-2">
              <JournalResourceToggle
                value={resourceKind}
                onChange={handleResourceKindChange}
                compact
              />
            </div>
          </div>

          <p className="mt-3 text-sm text-slate-600">
            {sortedAppointments.length > 0
              ? `${sortedAppointments.length} ${sortedAppointments.length === 1 ? "запись" : sortedAppointments.length < 5 ? "записи" : "записей"}`
              : "Нет записей"}
          </p>
        </>
      ) : (
        <div className="journal-page-toolbar relative z-10 box-border w-full max-w-full border-b border-slate-200 bg-slate-50 pb-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h1 className="mr-1 text-base font-bold text-slate-900">Журнал</h1>

            <div className="inline-flex items-center rounded-md border border-slate-300 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setDate((d) => shiftDateStr(d, -1))}
                className="flex h-7 w-7 items-center justify-center rounded text-sm text-slate-600 hover:bg-slate-50"
                aria-label="Предыдущий день"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setDate(todayStr())}
                className="h-7 rounded px-2 text-xs text-slate-700 hover:bg-slate-50"
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={() => setDate((d) => shiftDateStr(d, 1))}
                className="flex h-7 w-7 items-center justify-center rounded text-sm text-slate-600 hover:bg-slate-50"
                aria-label="Следующий день"
              >
                ›
              </button>
            </div>

            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 rounded-md border border-slate-300 px-2 text-xs"
            />

            {isSuperAdmin ? (
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={branches.length === 0}
                className="h-8 max-w-[11rem] rounded-md border border-slate-300 px-2 text-xs disabled:bg-slate-100"
              >
                {branches.length === 0 ? (
                  <option value="">{loading ? "Загрузка…" : "Нет филиалов"}</option>
                ) : (
                  branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))
                )}
              </select>
            ) : (
              <div className="flex h-8 max-w-[11rem] items-center truncate rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700">
                {branches.find((b) => b.id === branchId)?.name ??
                  branches[0]?.name ??
                  (loading ? "Загрузка…" : "Филиал…")}
              </div>
            )}

            <JournalResourceToggle
              value={resourceKind}
              onChange={handleResourceKindChange}
              dense
            />

            <ClientPhoneSearch
              branchId={branchId || undefined}
              onOpenAppointment={openEditFromSearch}
              compact
            />

            <button
              type="button"
              onClick={() => openNew()}
              className="h-8 shrink-0 rounded-md bg-lime-600 px-3 text-xs font-medium text-white hover:bg-lime-700"
            >
              + Запись
            </button>
          </div>

          {showGrid ? (
            <div className="mt-1.5 flex w-full min-w-0 items-center gap-x-2 gap-y-1">
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  className="size-3.5 rounded border-slate-300"
                  checked={hideInactiveColumns}
                  onChange={(e) => setHideInactiveColumns(e.target.checked)}
                />
                Скрыть пустые
              </label>
              <div className="min-w-0 flex-1 overflow-x-auto">
                <StatusLegend compact inline />
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2 pr-[0.5cm]">
                <JournalGridStepPicker
                  value={gridStep}
                  onChange={handleGridStepChange}
                  compact
                />
                <JournalGridZoomButtons
                  value={gridScale}
                  onChange={handleGridScaleChange}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}

      {isMobile && (
        <p className="mt-1 text-xs text-slate-400">Нажмите на запись для редактирования.</p>
      )}

      {!loading && branches.length === 0 && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Филиалы не загрузились.{" "}
          <button type="button" onClick={() => void load()} className="font-medium underline">
            Обновить
          </button>
          {" "}или выполните на сервере: npm run db:seed
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}. Попробуйте{" "}
          <button
            type="button"
            onClick={() => void load()}
            className="font-medium underline"
          >
            обновить
          </button>{" "}
          или перелогиниться.
        </p>
      )}

      {loading && staff.length === 0 ? (
        <p className="mt-8 text-slate-500">Загрузка…</p>
      ) : (
        <>
          {isMobile && (
        <div className="relative mt-3 pb-16">
          {loading && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-white/40 pt-4">
              <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500 shadow">
                Обновление…
              </span>
            </div>
          )}
          <div className="space-y-2">
            {sortedAppointments.length === 0 ? (
              <button
                type="button"
                onClick={() => openNew()}
                className="w-full touch-manipulation rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center active:bg-slate-50"
              >
                <p className="text-sm font-medium text-slate-700">Нет записей за этот день</p>
                <p className="mt-1 text-xs text-lime-700">+ Создать запись</p>
              </button>
            ) : (
              sortedAppointments.map((a) => {
                const name =
                  [a.client.firstName, a.client.lastName].filter(Boolean).join(" ") ||
                  a.client.phone;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => openEdit(a)}
                    className="w-full touch-manipulation rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm active:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-lg font-semibold tabular-nums text-lime-800">
                          {formatTimeMinsk(a.startAt)}
                        </p>
                        <p className="mt-0.5 truncate font-medium text-slate-900">{name}</p>
                        <p className="mt-0.5 truncate text-sm text-slate-600">
                          {a.service.name} · {journalStaffDisplayName(a.staff.name)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          #{a.publicNumber} · {a.price} Br · {a.durationMinutes} мин
                        </p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
          )}

          {showGrid && (
          <div
            className={cn(
              "admin-journal-sticky-panel relative mt-2 w-full max-w-full",
              fillGridViewport &&
                "admin-desktop:px-0 admin-tablet:px-0",
            )}
          >
            {loading && (
              <div className="pointer-events-none absolute inset-0 z-40 flex items-start justify-center bg-white/40 pt-4">
                <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500 shadow">
                  Обновление…
                </span>
              </div>
            )}
            <JournalGrid
              date={date}
              weekday={wd}
              branchId={branchId}
              staff={staff}
              resourceKind={resourceKind}
              appointments={sortedAppointments}
              gridStep={gridStep}
              gridScale={gridScale}
              fillViewport={fillGridViewport}
              hideInactive={hideInactiveColumns}
              onHideInactiveChange={setHideInactiveColumns}
              onSlotClick={openNew}
              onAppointmentClick={openEdit}
              onMoved={() => {
                void load({ silent: true });
                void loadList();
              }}
            />
          </div>
          )}
        </>
      )}

      <section
        className={cn(
          isMobile ? "mt-6" : showGrid ? "mt-4 border-t border-slate-200 pt-4" : "mt-10",
        )}
      >
        <button
          type="button"
          onClick={() => setPeriodListOpen((v) => !v)}
          className="flex w-full touch-manipulation items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-sm active:bg-slate-50"
          aria-expanded={periodListOpen}
        >
          <span
            className="text-slate-400 transition-transform"
            aria-hidden
            style={{ transform: periodListOpen ? "rotate(90deg)" : undefined }}
          >
            ›
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
              Записи за период
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {periodListOpen
                ? "Все записи, включая удалённые и отменённые"
                : filteredListRecords.length > 0
                  ? `${filteredListRecords.length} записей · ${listFrom} — ${listTo}`
                  : "Нажмите, чтобы развернуть"}
            </p>
          </div>
        </button>

        {periodListOpen && (
          <>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <p className="text-xs text-slate-500 sm:hidden">
            Все записи, включая удалённые и отменённые
          </p>
          <div className="flex flex-wrap items-end gap-2 sm:ml-auto">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 invisible select-none" aria-hidden="true">
                —
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const { from, to } = periodToday();
                    setListFrom(from);
                    setListTo(to);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Сегодня
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { from, to } = periodWeek();
                    setListFrom(from);
                    setListTo(to);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Неделя
                </button>
              </div>
            </div>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              С
              <input
                type="date"
                value={listFrom}
                max={listTo}
                onChange={(e) => setListFrom(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              По
              <input
                type="date"
                value={listTo}
                min={listFrom}
                onChange={(e) => setListTo(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>

        {listLoading ? (
          <p className="mt-4 text-sm text-slate-500">Загрузка…</p>
        ) : filteredListRecords.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">Нет записей за выбранный период</p>
        ) : (
          <>
            {isMobile ? (
            <div className="mt-4 space-y-2">
              {filteredListRecords.map((a) => {
                const name =
                  [a.client.firstName, a.client.lastName].filter(Boolean).join(" ") ||
                  a.client.phone;
                const reason = cancelReasonLabel(a.cancelReason);
                const hidden = isHiddenFromJournal(a.status);
                const Wrapper = hidden ? "div" : "button";
                return (
                  <Wrapper
                    key={a.id}
                    type={hidden ? undefined : "button"}
                    onClick={hidden ? undefined : () => openEdit(a)}
                    className={`w-full rounded-lg border px-4 py-3 text-left text-sm ${
                      hidden
                        ? "border-red-100 bg-red-50/40 text-slate-600"
                        : "border-slate-200 bg-white shadow-sm active:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800">
                          {new Date(a.startAt).toLocaleString("ru-RU", {
                            timeZone: "Europe/Minsk",
                          })}{" "}
                          · {name}
                        </p>
                        <p className="mt-0.5 text-slate-600">
                          {a.service.name} · {journalStaffDisplayName(a.staff.name)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          #{a.publicNumber} · {a.price} Br
                          {reason ? ` · ${reason}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                  </Wrapper>
                );
              })}
            </div>
            ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2">#</th>
                    <th>Клиент</th>
                    <th>Услуга</th>
                    <th>Ресурс</th>
                    <th>Время</th>
                    <th>Цена</th>
                    <th>Причина</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredListRecords.map((a) => {
                    const hidden = isHiddenFromJournal(a.status);
                    return (
                      <tr
                        key={a.id}
                        onClick={hidden ? undefined : () => openEdit(a)}
                        className={`border-b border-slate-100 ${
                          hidden
                            ? "text-slate-500"
                            : "cursor-pointer hover:bg-slate-50"
                        }`}
                      >
                        <td className="py-2">{a.publicNumber}</td>
                        <td>
                          {a.client.phone}
                          <br />
                          <span className="text-slate-500">
                            {[a.client.firstName, a.client.lastName]
                              .filter(Boolean)
                              .join(" ")}
                          </span>
                        </td>
                        <td>{a.service.name}</td>
                        <td>{journalStaffDisplayName(a.staff.name)}</td>
                        <td>
                          {new Date(a.startAt).toLocaleString("ru-RU", {
                            timeZone: "Europe/Minsk",
                          })}
                        </td>
                        <td>{a.price} Br</td>
                        <td>{cancelReasonLabel(a.cancelReason) || "—"}</td>
                        <td>
                          <StatusBadge status={a.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </>
        )}
          </>
        )}
      </section>

      {isMobile && (
        <button
          type="button"
          onClick={() => openNew()}
          className="fixed right-4 z-40 flex h-14 w-14 touch-manipulation items-center justify-center rounded-full bg-lime-600 text-2xl font-light text-white shadow-lg active:scale-95 active:bg-lime-700"
          style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          aria-label="Новая запись"
        >
          +
        </button>
      )}

      <AppointmentModal
        key={editAppt?.id ?? `new-${modalInitial.startAt ?? ""}-${modalInitial.staffId ?? ""}`}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditAppt(null);
          setEditGroup(null);
          setModalInitial({});
        }}
        onSaved={refreshAll}
        branches={branches}
        appointmentId={editAppt?.id}
        appointmentGroup={modalProps.appointmentGroup}
        totalPrice={modalProps.totalPrice}
        initial={modalProps}
      />
    </div>
  );
}
