"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppointmentModal } from "./AppointmentModal";
import { ClientPhoneSearch, type ClientLookupAppointment } from "./ClientPhoneSearch";
import { DatePickerField } from "./DatePickerField";
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
import { AdminFreeSlotPicker } from "./AdminFreeSlotPicker";
import {
  buildJournalResourceOptions,
  buildStaffServiceLinks,
  loadJournalResourceFilter,
  matchesResourceKind,
  saveJournalResourceFilter,
  type JournalResourceFilter,
} from "@/lib/journal-resources";
import { StatusBadge } from "./StatusBadge";
import { cancelReasonLabel, JOURNAL_HIDDEN_STATUSES } from "@/lib/appointment-status";
import { groupConsecutiveClientAppointments, isoAtMinutes } from "@/lib/calendar-grid";
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
import { isAdminCompact } from "@/lib/admin-viewport";
import { journalStaffDisplayName } from "@/lib/journal-staff-label";
import { staffDisplayName } from "@/lib/staff-user";
import { useSuperAdminBranchOptional } from "@/components/admin/SuperAdminBranchProvider";
import {
  loadAppointmentsListAction,
  loadCalendarDayAction,
  loadCalendarDayAppointmentsAction,
  loadCalendarDayDeltaAction,
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
  rentalItemId?: string | null;
  rentalQuantity?: number;
  rentalAmount?: number;
  cancelReason?: string | null;
  branchId: string;
  operatorMemberId?: string | null;
  operatorMember?: {
    id: string;
    user: { name: string | null; lastName: string | null; login: string | null; email: string | null };
  } | null;
  client: { firstName: string | null; lastName: string | null; phone: string };
  service: { id: string; name: string };
  staff: { id: string; name: string };
};

type Branch = { id: string; name: string };

type BranchService = {
  id: string;
  name: string;
  kind?: string;
  resourceLabel?: string | null;
  isActive?: boolean;
  branchId: string;
  staff: { staffId: string }[];
};

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
  rentalItemId?: string | null;
  rentalQuantity?: number;
  totalPrice?: number;
  operatorMemberId?: string | null;
  operatorMemberName?: string;
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

type CompactJournalView = "list" | "grid";
const COMPACT_JOURNAL_VIEW_KEY = "journal-compact-view";

function loadCompactJournalView(): CompactJournalView {
  if (typeof window === "undefined") return "list";
  return localStorage.getItem(COMPACT_JOURNAL_VIEW_KEY) === "grid" ? "grid" : "list";
}

function saveCompactJournalView(view: CompactJournalView) {
  localStorage.setItem(COMPACT_JOURNAL_VIEW_KEY, view);
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
    endAt: a.endAt,
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
      services: [] as BranchService[],
      isSuperAdmin: true,
      canEditAppointments: true,
      canCreateAppointments: true,
      journalReadOnlyOutsideScope: false,
      loading: true,
    };
  }

  return {
    date: initial.date,
    branchId: initial.branchId ?? "",
    staff: (initial.staff ?? []) as StaffRow[],
    appointments: (initial.appointments ?? []) as Appointment[],
    branches: initial.branches ?? [],
    services: (initial.services ?? []) as BranchService[],
    isSuperAdmin: initial.admin?.isSuperAdmin ?? true,
    canEditAppointments: initial.admin?.canEditAppointmentsInBranch ?? initial.admin?.canEditAppointments ?? true,
    canCreateAppointments: initial.admin?.canCreateAppointmentsInBranch ?? true,
    journalReadOnlyOutsideScope: initial.admin?.journalReadOnlyOutsideScope ?? false,
    loading: false,
  };
}

export function JournalDay({ initial }: { initial?: JournalDayInitial }) {
  const boot = journalInitialState(initial);
  const superBranch = useSuperAdminBranchOptional();
  const [date, setDate] = useState(boot.date);
  const [branchId, setBranchId] = useState(boot.branchId);
  const [staff, setStaff] = useState<StaffRow[]>(boot.staff);
  const [appointments, setAppointments] = useState<Appointment[]>(boot.appointments);
  const [listRecords, setListRecords] = useState<Appointment[]>([]);
  const [listFrom, setListFrom] = useState(() => periodToday().from);
  const [listTo, setListTo] = useState(() => periodToday().to);
  const [listLoading, setListLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>(boot.branches);
  const [services, setServices] = useState<BranchService[]>(boot.services);
  const [loading, setLoading] = useState(boot.loading);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [editGroup, setEditGroup] = useState<Appointment[] | null>(null);
  const [modalInitial, setModalInitial] = useState<ModalInitial>({});
  const [isSuperAdmin, setIsSuperAdmin] = useState(boot.isSuperAdmin);
  const [isBranchManager, setIsBranchManager] = useState(
    initial?.admin?.isBranchManager ?? false,
  );
  const [canEditAppointments, setCanEditAppointments] = useState(boot.canEditAppointments);
  const [canCreateAppointments, setCanCreateAppointments] = useState(boot.canCreateAppointments);
  const [journalReadOnlyOutsideScope, setJournalReadOnlyOutsideScope] = useState(
    boot.journalReadOnlyOutsideScope,
  );

  function applyBranchId(id: string) {
    setBranchId(id);
    if (isSuperAdmin) superBranch?.setBranchId(id);
  }

  useEffect(() => {
    if (!isSuperAdmin || !superBranch?.branchId) return;
    if (superBranch.branchId !== branchId) {
      setBranchId(superBranch.branchId);
    }
  }, [isSuperAdmin, superBranch?.branchId, branchId]);
  const skipInitialLoadRef = useRef(Boolean(initial));
  const [gridStep, setGridStep] = useState<JournalGridStep>(15);
  const [gridScale, setGridScale] = useState<JournalGridScale>(1);
  const [resourceKind, setResourceKind] = useState<JournalResourceFilter>("all");
  const [periodListOpen, setPeriodListOpen] = useState(false);
  const periodListOpenRef = useRef(periodListOpen);
  periodListOpenRef.current = periodListOpen;
  const [freeSlotsOpen, setFreeSlotsOpen] = useState(false);
  const [compactView, setCompactView] = useState<CompactJournalView>("list");
  const loadSeqRef = useRef(0);
  const shellBranchRef = useRef(boot.branchId);
  const hasShellRef = useRef(Boolean(initial && (initial.services?.length ?? 0) > 0));
  const appointmentsSnapshotRef = useRef<Appointment[] | null>(null);
  const viewport = useAdminViewport();
  const isCompactJournal = isAdminCompact(viewport);
  const showGrid = !isCompactJournal || compactView === "grid";
  const showCompactList = isCompactJournal && compactView === "list" && !freeSlotsOpen;
  const fillGridViewport = showGrid && !isCompactJournal;

  useEffect(() => {
    setGridStep(loadJournalGridStep());
    setGridScale(loadJournalGridScale());
    setCompactView(loadCompactJournalView());
  }, []);

  function handleCompactViewChange(view: CompactJournalView) {
    setCompactView(view);
    saveCompactJournalView(view);
    if (view === "grid") setFreeSlotsOpen(false);
  }

  const branchServices = useMemo(
    () => services.filter((s) => !branchId || s.branchId === branchId),
    [services, branchId],
  );

  const branchServiceIds = useMemo(
    () =>
      branchServices
        .map((s) => s.id)
        .sort()
        .join(","),
    [branchServices],
  );

  const resourceOptions = useMemo(
    () => buildJournalResourceOptions(branchServices),
    [branchServices],
  );

  const staffServiceLinks = useMemo(
    () => buildStaffServiceLinks(branchServices),
    [branchServices],
  );

  const selectedService = useMemo(() => {
    if (resourceKind === "all") return null;
    return branchServices.find((s) => s.id === resourceKind) ?? null;
  }, [branchServices, resourceKind]);

  const selectedServiceStaff = useMemo(() => {
    if (!selectedService) return [];
    const linked = new Set(selectedService.staff.map((row) => row.staffId));
    return staff
      .filter((row) => linked.has(row.id))
      .map((row) => ({ id: row.id, name: row.name }));
  }, [selectedService, staff]);

  useEffect(() => {
    if (resourceKind === "all") setFreeSlotsOpen(false);
  }, [resourceKind]);

  useEffect(() => {
    if (!branchId) {
      setResourceKind("all");
      return;
    }
    setResourceKind(loadJournalResourceFilter(branchId, branchServices));
    // Reload filter only when branch or service catalog identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, branchServiceIds]);

  useEffect(() => {
    if (resourceKind === "all") return;
    if (!resourceOptions.some((option) => option.value === resourceKind)) {
      setResourceKind("all");
      if (branchId) saveJournalResourceFilter(branchId, "all");
    }
  }, [resourceKind, resourceOptions, branchId]);

  function handleResourceKindChange(kind: JournalResourceFilter) {
    setResourceKind(kind);
    if (branchId) saveJournalResourceFilter(branchId, kind);
  }

  function handleGridStepChange(step: JournalGridStep) {
    setGridStep(step);
    saveJournalGridStep(step);
  }

  function handleGridScaleChange(scale: JournalGridScale) {
    setGridScale(scale);
    saveJournalGridScale(scale);
  }

  const applyAdminFlags = useCallback((admin: CalendarDayPayload["admin"] | undefined) => {
    if (!admin) return;
    setIsSuperAdmin(admin.isSuperAdmin);
    setIsBranchManager(admin.isBranchManager ?? false);
    setCanEditAppointments(
      admin.canEditAppointmentsInBranch ?? admin.canEditAppointments ?? true,
    );
    setCanCreateAppointments(admin.canCreateAppointmentsInBranch ?? true);
    setJournalReadOnlyOutsideScope(admin.journalReadOnlyOutsideScope ?? false);
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean; full?: boolean }) => {
      if (!branchId) return;

      const silent = opts?.silent ?? false;
      const branchChanged = shellBranchRef.current !== branchId;
      const useFull = Boolean(opts?.full || branchChanged || !hasShellRef.current);
      const reqId = ++loadSeqRef.current;

      if (!silent) {
        setLoading(true);
        if (branchChanged || useFull) {
          setAppointments([]);
        }
      }
      setError("");

      try {
        if (useFull) {
          const result = await loadCalendarDayAction(date, branchId);
          if (reqId !== loadSeqRef.current) return;
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
          setServices((d.services ?? []) as BranchService[]);
          applyAdminFlags(d.admin);
          shellBranchRef.current = branchId;
          hasShellRef.current = true;

          if (d.admin && !d.admin.isSuperAdmin && !d.admin.isBranchManager && d.admin.branchId) {
            setBranchId(d.admin.branchId);
          }
        } else {
          const result = await loadCalendarDayDeltaAction(date, branchId);
          if (reqId !== loadSeqRef.current) return;
          if (!result.ok) {
            setError(result.error);
            if (!silent) setAppointments([]);
            return;
          }

          const d = result.data;
          setStaff((d.staff ?? []) as StaffRow[]);
          setAppointments((d.appointments ?? []) as Appointment[]);
          applyAdminFlags(d.admin);
        }
      } catch {
        if (reqId !== loadSeqRef.current) return;
        setError("Ошибка при загрузке журнала");
        if (!silent) {
          setStaff([]);
          setAppointments([]);
        }
      } finally {
        if (reqId === loadSeqRef.current && !silent) {
          setLoading(false);
        }
      }
    },
    [date, branchId, applyAdminFlags],
  );

  const loadList = useCallback(async () => {
    if (listFrom > listTo || !branchId) return;
    setListLoading(true);
    try {
      const result = await loadAppointmentsListAction(listFrom, listTo, branchId);
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
    if (!branchId) return;
    if (skipInitialLoadRef.current) {
      skipInitialLoadRef.current = false;
      shellBranchRef.current = branchId;
      return;
    }
    void load();
  }, [load, branchId]);

  useEffect(() => {
    if (!periodListOpen) return;
    void loadList();
  }, [loadList, periodListOpen]);

  const reloadJournal = useCallback(
    async (opts?: { silent?: boolean; appointmentsOnly?: boolean; full?: boolean }) => {
      if (opts?.appointmentsOnly) {
        const forDate = date;
        const forBranch = branchId;
        try {
          const result = await loadCalendarDayAppointmentsAction(
            forDate,
            forBranch || undefined,
          );
          if (forDate !== date || forBranch !== branchId) return;
          if (result.ok) {
            setAppointments((result.appointments ?? []) as Appointment[]);
            appointmentsSnapshotRef.current = null;
          } else if (!opts.silent) {
            setError(result.error);
          }
        } catch {
          if (!opts.silent && forDate === date && forBranch === branchId) {
            setError("Не удалось обновить записи");
          }
        }
        if (periodListOpenRef.current) {
          await loadList();
        }
        return;
      }

      await load({ silent: opts?.silent, full: opts?.full });
      if (periodListOpenRef.current) {
        await loadList();
      }
    },
    [load, loadList, date, branchId],
  );

  const refreshAll = useCallback(async () => {
    await reloadJournal({ silent: true, appointmentsOnly: true });
  }, [reloadJournal]);

  const applyOptimisticMove = useCallback(
    (
      group: Pick<Appointment, "id" | "startAt" | "durationMinutes">[],
      targetStaffId: string,
      targetStartMinutes: number,
    ) => {
      const sorted = [...group].sort((a, b) => a.startAt.localeCompare(b.startAt));
      if (!sorted.length) return;
      const newFirstStart = isoAtMinutes(date, targetStartMinutes);
      const deltaMs =
        new Date(newFirstStart).getTime() - new Date(sorted[0].startAt).getTime();
      const targetStaff = staff.find((s) => s.id === targetStaffId);
      const ids = new Set(sorted.map((a) => a.id));

      setAppointments((prev) => {
        appointmentsSnapshotRef.current = prev;
        return prev.map((a) => {
          if (!ids.has(a.id)) return a;
          const newStartMs = new Date(a.startAt).getTime() + deltaMs;
          const newEndMs = newStartMs + a.durationMinutes * 60_000;
          return {
            ...a,
            startAt: new Date(newStartMs).toISOString(),
            endAt: new Date(newEndMs).toISOString(),
            staff: targetStaff
              ? { id: targetStaff.id, name: targetStaff.name }
              : a.staff,
          };
        });
      });
    },
    [date, staff],
  );

  const applyOptimisticResize = useCallback(
    (
      group: Pick<Appointment, "id" | "startAt" | "durationMinutes">[],
      newTotalDuration: number,
    ) => {
      if (group.length !== 1) return;
      const appt = group[0];
      const newEndMs =
        new Date(appt.startAt).getTime() + newTotalDuration * 60_000;
      setAppointments((prev) => {
        appointmentsSnapshotRef.current = prev;
        return prev.map((a) =>
          a.id === appt.id
            ? {
                ...a,
                durationMinutes: newTotalDuration,
                endAt: new Date(newEndMs).toISOString(),
              }
            : a,
        );
      });
    },
    [],
  );

  const rollbackOptimistic = useCallback(() => {
    if (appointmentsSnapshotRef.current) {
      setAppointments(appointmentsSnapshotRef.current);
      appointmentsSnapshotRef.current = null;
    }
  }, []);

  const wd = weekdayMinsk(date);

  const sortedAppointments = useMemo(
    () =>
      [...appointments]
        .filter((a) =>
          matchesResourceKind(a.staff.id, resourceKind, staffServiceLinks),
        )
        .sort(
          (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
        ),
    [appointments, resourceKind, staffServiceLinks],
  );

  const filteredListRecords = useMemo(
    () =>
      listRecords.filter((a) =>
        matchesResourceKind(a.staff.id, resourceKind, staffServiceLinks),
      ),
    [listRecords, resourceKind, staffServiceLinks],
  );

  function handleFreeSlotPick(pick: {
    startAt: string;
    staffId?: string;
    staffName?: string;
  }) {
    openNew({
      branchId: branchId || branches[0]?.id,
      serviceId: selectedService?.id,
      staffId: pick.staffId,
      staffName: pick.staffName,
      startAt: pick.startAt,
    });
  }

  function openNew(initial: ModalInitial = {}) {
    if (!canCreateAppointments) return;
    setEditAppt(null);
    setEditGroup(null);
    setModalInitial({
      branchId: branchId || branches[0]?.id,
      ...initial,
    });
    setModalOpen(true);
  }

  function openEdit(appt: Appointment, group?: Appointment[]) {
    if (!canEditAppointments) return;
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
    if (!canEditAppointments) return;
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
        rentalItemId: editAppt.rentalItemId ?? null,
        rentalQuantity: editAppt.rentalQuantity ?? 0,
        operatorMemberId: editAppt.operatorMemberId ?? null,
        operatorMemberName: editAppt.operatorMember
          ? staffDisplayName(editAppt.operatorMember.user)
          : undefined,
        totalPrice: editGroup
          ? editGroup.reduce((sum, a) => sum + a.price, 0)
          : editAppt.price,
        appointmentGroup: editGroup ? toGroupRefs(editGroup) : undefined,
      }
    : modalInitial;

  return (
    <div className="relative">
      {isCompactJournal ? (
        <>
          <div className="journal-mobile-toolbar">
            <div className="flex items-center gap-1" data-onboarding="journal-date">
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

            <DatePickerField
              label="Дата"
              labelClassName="sr-only"
              value={date}
              onChange={setDate}
              className="h-11 w-full touch-manipulation rounded-lg border border-slate-300 bg-white px-3 text-base"
            />

            {!isSuperAdmin && !isBranchManager && (
              <div className="mt-2 flex h-11 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
                {branches.find((b) => b.id === branchId)?.name ??
                  branches[0]?.name ??
                  (loading ? "Загрузка…" : "Филиал…")}
              </div>
            )}

            {isBranchManager && branches.length > 0 && (
              <label className="mt-2 block">
                <span className="mb-1 block text-xs text-slate-500">Филиал</span>
                <select
                  className="h-11 w-full touch-manipulation rounded-lg border border-slate-300 bg-white px-3 text-base"
                  value={branchId}
                  onChange={(e) => applyBranchId(e.target.value)}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="mt-2">
              <JournalResourceToggle
                value={resourceKind}
                onChange={handleResourceKindChange}
                options={resourceOptions}
                compact
              />
            </div>

            <div
              className="mt-2 inline-flex w-full rounded-lg border border-slate-300 bg-white p-0.5"
              role="group"
              aria-label="Вид журнала"
            >
              <button
                type="button"
                onClick={() => handleCompactViewChange("list")}
                className={cn(
                  "h-10 flex-1 touch-manipulation rounded-md text-sm font-medium",
                  compactView === "list"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 active:bg-slate-50",
                )}
              >
                Список
              </button>
              <button
                type="button"
                onClick={() => handleCompactViewChange("grid")}
                className={cn(
                  "h-10 flex-1 touch-manipulation rounded-md text-sm font-medium",
                  compactView === "grid"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 active:bg-slate-50",
                )}
              >
                Сетка
              </button>
            </div>

            {compactView === "grid" && (
              <div className="mt-2 flex items-center justify-between gap-2">
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
            )}

            {canCreateAppointments && compactView === "list" && (
            <button
              type="button"
              disabled={!selectedService}
              onClick={() => setFreeSlotsOpen((open) => !open)}
              className="mt-2 flex h-11 w-full touch-manipulation items-center justify-center rounded-lg border border-lime-600 bg-lime-50 px-3 text-sm font-semibold text-lime-800 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {freeSlotsOpen ? "← К записям" : "Свободное время"}
            </button>
            )}
          </div>

          {freeSlotsOpen && selectedService ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-sm font-medium text-slate-900">Свободное время</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Нажмите на слот, чтобы создать запись
              </p>
              <AdminFreeSlotPicker
                className="mt-3"
                compact
                serviceId={selectedService.id}
                serviceKind={selectedService.kind ?? "wake"}
                date={date}
                staffOptions={selectedServiceStaff}
                onPick={handleFreeSlotPick}
              />
            </div>
          ) : compactView === "list" ? (
            <p className="mt-3 text-sm text-slate-600">
              {sortedAppointments.length > 0
                ? `${sortedAppointments.length} ${sortedAppointments.length === 1 ? "запись" : sortedAppointments.length < 5 ? "записи" : "записей"}`
                : "Нет записей"}
            </p>
          ) : null}
        </>
      ) : (
        <div className="journal-page-toolbar relative z-10 box-border w-full max-w-full border-b border-slate-200 bg-slate-50 pb-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h1 className="mr-1 text-base font-bold text-slate-900">Журнал</h1>

            <div className="inline-flex items-center rounded-md border border-slate-300 bg-white p-0.5" data-onboarding="journal-date">
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

            <DatePickerField
              value={date}
              onChange={setDate}
              className="h-8 rounded-md border border-slate-300 px-2 text-xs"
            />

            {!isSuperAdmin && !isBranchManager && (
              <div className="flex h-8 max-w-[11rem] items-center truncate rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700">
                {branches.find((b) => b.id === branchId)?.name ??
                  branches[0]?.name ??
                  (loading ? "Загрузка…" : "Филиал…")}
              </div>
            )}

            {isBranchManager && branches.length > 0 && (
              <select
                className="h-8 max-w-[11rem] rounded-md border border-slate-300 bg-white px-2 text-xs"
                value={branchId}
                onChange={(e) => applyBranchId(e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}

            <JournalResourceToggle
              value={resourceKind}
              onChange={handleResourceKindChange}
              options={resourceOptions}
              dense
            />

            <ClientPhoneSearch
              branchId={branchId || undefined}
              onOpenAppointment={openEditFromSearch}
              compact
            />

            {canCreateAppointments && (
            <button
              type="button"
              onClick={() => openNew()}
              className="h-8 shrink-0 rounded-md bg-lime-600 px-3 text-xs font-medium text-white hover:bg-lime-700"
            >
              + Запись
            </button>
            )}

            {showGrid ? (
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
            ) : null}
          </div>
        </div>
      )}

      {isCompactJournal && compactView === "list" && (
        <p className="mt-1 text-xs text-slate-400">Нажмите на запись для редактирования.</p>
      )}
      {isCompactJournal && compactView === "grid" && (
        <p className="mt-1 text-xs text-slate-400">
          Сетка как на компьютере — листайте вбок по реверсам, нажмите на слот или запись.
        </p>
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
          {error}
          {/сессия|доступ|загруз/i.test(error) ? (
            <>
              . Попробуйте{" "}
              <button
                type="button"
                onClick={() => void load({ full: true })}
                className="font-medium underline"
              >
                обновить
              </button>{" "}
              или перелогиниться.
            </>
          ) : (
            <>
              .{" "}
              <button
                type="button"
                onClick={() => {
                  setError("");
                  void reloadJournal({ silent: false, appointmentsOnly: true });
                }}
                className="font-medium underline"
              >
                Обновить записи
              </button>
            </>
          )}
        </p>
      )}

      {!canEditAppointments && !canCreateAppointments && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Журнал доступен только для просмотра. Редактирование записей — в день смены с отметкой «Работает как админ».
        </p>
      )}

      {journalReadOnlyOutsideScope && (
        <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900">
          Только просмотр и новые записи — редактирование доступно в ваших филиалах.
        </p>
      )}

      {!canEditAppointments && canCreateAppointments && !journalReadOnlyOutsideScope && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Можно создавать новые записи; редактирование существующих недоступно.
        </p>
      )}

      {loading && staff.length === 0 ? (
        <p className="mt-8 text-slate-500">Загрузка…</p>
      ) : (
        <>
          {showCompactList && (
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
              canCreateAppointments ? (
              <button
                type="button"
                onClick={() => openNew()}
                className="w-full touch-manipulation rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center active:bg-slate-50"
              >
                <p className="text-sm font-medium text-slate-700">Нет записей за этот день</p>
                <p className="mt-1 text-xs text-lime-700">+ Создать запись</p>
              </button>
              ) : (
              <div className="w-full rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-700">Нет записей за этот день</p>
              </div>
              )
            ) : (
              sortedAppointments.map((a) => {
                const name =
                  [a.client.firstName, a.client.lastName].filter(Boolean).join(" ") ||
                  a.client.phone;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={canEditAppointments ? () => openEdit(a) : undefined}
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

          {showGrid && !freeSlotsOpen && (
          <div
            className={cn(
              "admin-journal-sticky-panel relative mt-2 w-full max-w-full",
              isCompactJournal && "overflow-x-auto pb-16",
              fillGridViewport &&
                "admin-desktop:px-0 admin-tablet:px-0",
            )}
            data-onboarding="journal-grid"
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
              staffServiceLinks={staffServiceLinks}
              appointments={sortedAppointments}
              gridStep={gridStep}
              gridScale={gridScale}
              fillViewport={fillGridViewport}
              onSlotClick={canCreateAppointments ? openNew : () => {}}
              onScheduleSaved={() => {
                void reloadJournal({ silent: true });
              }}
              onAppointmentClick={canEditAppointments ? openEdit : () => {}}
              onOptimisticMove={applyOptimisticMove}
              onOptimisticResize={applyOptimisticResize}
              onOptimisticRollback={rollbackOptimistic}
              onMoved={() => reloadJournal({ silent: true, appointmentsOnly: true })}
              onActionError={setError}
            />
          </div>
          )}
        </>
      )}

      <section
        className={cn(
          isCompactJournal ? "mt-6" : showGrid ? "mt-4 border-t border-slate-200 pt-4" : "mt-10",
        )}
      >
        <button
          type="button"
          onClick={() => {
            setPeriodListOpen((v) => {
              const next = !v;
              if (next) void loadList();
              return next;
            });
          }}
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
              <DatePickerField
                value={listFrom}
                max={listTo}
                onChange={setListFrom}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              По
              <DatePickerField
                value={listTo}
                min={listFrom}
                onChange={setListTo}
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
            {isCompactJournal ? (
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

      {isCompactJournal && canCreateAppointments && !freeSlotsOpen && (
        <button
          type="button"
          onClick={() => openNew()}
          data-onboarding="journal-new"
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
