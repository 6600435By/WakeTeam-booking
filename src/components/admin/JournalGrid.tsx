"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StaffDayScheduleModal } from "./StaffDayScheduleModal";
import {
  formatMinutesLabel,
  generateTimeLabels,
  getAppointmentLayout,
  getAppointmentOverlapSegments,
  getGridBounds,
  getOverlapRegions,
  getStaffRule,
  groupConsecutiveClientAppointments,
  type ConsecutiveAppointmentGroup,
  isoAtMinutes,
  isStaffWorkingAt,
  minutesFromIso,
  minutesToTime,
  appointmentGroupCellMinutes,
  appointmentGroupSpanMinutes,
  snapDurationToCell,
  type JournalGridStep,
} from "@/lib/calendar-grid";
import { formatTimeMinsk } from "@/lib/time";
import {
  statusBlockClass,
  statusDotClass,
  statusLabel,
} from "@/lib/appointment-status";
import {
  loadJournalCollapsedColumns,
  saveJournalCollapsedColumns,
  staffMatchesResourceFilter,
  type JournalResourceFilter,
} from "@/lib/journal-resources";
import {
  moveGroupAppointments,
  resizeGroupAppointments,
  type GroupApptRef,
} from "@/lib/admin/appointment-group-client";
import { useAdminViewport } from "./AdminViewportContext";
import { cn } from "@/lib/utils";
import { journalStaffDisplayName } from "@/lib/journal-staff-label";
import { catalogStaff } from "@/lib/admin/staff-catalog";
import {
  getJournalSlotHeightPx,
  type JournalGridScale,
} from "@/lib/journal-grid-scale";

const DRAG_THRESHOLD_PX = 6;
const HEADER_HEIGHT_PX = 28;
const JOURNAL_PAGE_SCROLL_SELECTOR = ".admin-app-scroll";

function getJournalPageScrollEl(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(JOURNAL_PAGE_SCROLL_SELECTOR);
}

function captureJournalScrollState(gridEl: HTMLDivElement | null) {
  const pageScroll = getJournalPageScrollEl();
  return {
    left: gridEl?.scrollLeft ?? 0,
    top: pageScroll?.scrollTop ?? gridEl?.scrollTop ?? 0,
  };
}

function restoreJournalScrollState(
  gridEl: HTMLDivElement | null,
  left: number,
  top: number,
) {
  const pageScroll = getJournalPageScrollEl();
  if (gridEl) gridEl.scrollLeft = left;
  if (pageScroll) pageScroll.scrollTop = top;
  else if (gridEl) gridEl.scrollTop = top;
}

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
  durationMinutes: number;
  price: number;
  comment: string | null;
  branchId: string;
  client: { firstName: string | null; lastName: string | null; phone: string };
  service: { id: string; name: string };
  staff: { id: string; name: string };
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
};

type DragState = {
  appt: Appointment;
  group: Appointment[];
  staffId: string;
  startMinutes: number;
  height: number;
  valid: boolean;
};

type ResizeState = {
  group: Appointment[];
  staffId: string;
  startMinutes: number;
  durationMinutes: number;
  cellMinutes: number;
  height: number;
};

type PointerStart = {
  appt: Appointment;
  group: Appointment[];
  x: number;
  y: number;
  height: number;
};

type Props = {
  date: string;
  weekday: number;
  branchId: string;
  staff: StaffRow[];
  resourceKind?: JournalResourceFilter;
  staffServiceLinks?: Map<string, Set<string>>;
  appointments: Appointment[];
  gridStep: JournalGridStep;
  gridScale?: JournalGridScale;
  fillViewport?: boolean;
  onScheduleSaved?: () => void;
  onSlotClick: (initial: ModalInitial) => void;
  onAppointmentClick: (appt: Appointment, group: Appointment[]) => void;
  onOptimisticMove?: (
    group: Appointment[],
    staffId: string,
    startMinutes: number,
  ) => void;
  onOptimisticResize?: (group: Appointment[], durationMinutes: number) => void;
  onOptimisticRollback?: () => void;
  onMoved: () => void | Promise<void>;
  onActionError?: (message: string) => void;
};

function toGroupRefs(appts: Appointment[]): GroupApptRef[] {
  return appts.map((a) => ({
    id: a.id,
    startAt: a.startAt,
    endAt: a.endAt,
    durationMinutes: a.durationMinutes,
    price: a.price,
  }));
}

function groupCreateTemplate(first: Appointment) {
  return {
    serviceId: first.service.id,
    staffId: first.staff.id,
    phone: first.client.phone,
    firstName: first.client.firstName ?? "",
    lastName: first.client.lastName ?? undefined,
    comment: first.comment ?? undefined,
    status: first.status,
  };
}

function groupTotalMinutes(group: Appointment[]): number {
  return appointmentGroupSpanMinutes(group);
}

/** Одиночная запись меняет длительность шагом сетки; группа сегментов — шагом сегмента. */
function resizeStepForGroup(
  group: Appointment[],
  gridStep: JournalGridStep,
): number {
  if (group.length > 1) {
    const cell = appointmentGroupCellMinutes(group);
    return cell > 0 ? cell : gridStep;
  }
  return gridStep;
}

function collapsedStaffLabel(name: string): string {
  const label = journalStaffDisplayName(name);
  const match = label.match(/(?:№\s*|\s)(\d+)\s*$/);
  if (match) return `№${match[1]}`;
  return label.length > 6 ? `${label.slice(0, 5)}…` : label;
}

function staffColumnWidthClass(
  collapsed: boolean,
  expandColumns: boolean,
  extra?: string,
  fitViewport?: boolean,
) {
  return cn(
    "border-r border-slate-200 last:border-r-0",
    collapsed
      ? "w-10 shrink-0"
      : expandColumns
        ? fitViewport
          ? "min-w-[3.25rem] flex-1"
          : "min-w-[9rem] flex-1"
        : "w-32 shrink-0 sm:w-36 md:w-40",
    extra,
  );
}

function topPxFromMinutes(
  minutes: number,
  boundsStart: number,
  slotMinutes: number,
  slotHeightPx: number,
): number {
  return ((minutes - boundsStart) / slotMinutes) * slotHeightPx;
}

export function JournalGrid({
  date,
  weekday,
  branchId,
  staff,
  resourceKind = "all",
  staffServiceLinks,
  appointments,
  gridStep,
  gridScale = 1,
  fillViewport = false,
  onScheduleSaved,
  onSlotClick,
  onAppointmentClick,
  onOptimisticMove,
  onOptimisticResize,
  onOptimisticRollback,
  onMoved,
  onActionError,
}: Props) {
  const [scheduleModal, setScheduleModal] = useState<{
    staffId: string;
    staffName: string;
  } | null>(null);
  const viewport = useAdminViewport();
  const isDesktop = viewport === "desktop";
  const slotHeightPx = useMemo(
    () => getJournalSlotHeightPx(gridScale),
    [gridScale],
  );
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [pointerStart, setPointerStart] = useState<PointerStart | null>(null);
  const columnRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const pointerStartRef = useRef<PointerStart | null>(null);
  const suppressClickRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollRestore = useRef<{ left: number; top: number } | null>(
    null,
  );
  const isMutatingRef = useRef(false);
  dragRef.current = drag;
  resizeRef.current = resize;
  pointerStartRef.current = pointerStart;

  const isTracking = drag !== null || resize !== null || pointerStart !== null;

  useEffect(() => {
    if (!branchId) {
      setCollapsedIds(new Set());
      return;
    }
    const stored = loadJournalCollapsedColumns(branchId);
    const valid = new Set(staff.map((s) => s.id));
    setCollapsedIds(new Set(stored.filter((id) => valid.has(id))));
  }, [branchId, staff]);

  function toggleColumnCollapsed(staffId: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      if (branchId) saveJournalCollapsedColumns(branchId, [...next]);
      return next;
    });
  }

  const staffLinks = staffServiceLinks ?? new Map<string, Set<string>>();

  const visibleStaff = useMemo(() => {
    const list = catalogStaff(
      staff.filter((s) => !branchId || s.branchId === branchId),
    );
    const filtered = list.filter((s) =>
      staffMatchesResourceFilter(s, resourceKind, staffLinks),
    );
    return filtered;
  }, [staff, branchId, resourceKind, staffLinks]);

  const bounds = useMemo(
    () =>
      getGridBounds(
        visibleStaff.length ? visibleStaff : staff,
        weekday,
        appointments,
        date,
        gridStep,
      ),
    [visibleStaff, staff, weekday, appointments, date, gridStep],
  );

  const timeLabels = useMemo(
    () => generateTimeLabels(bounds.start, bounds.end, gridStep),
    [bounds, gridStep],
  );

  const appointmentsByStaffId = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appt of appointments) {
      const list = map.get(appt.staff.id);
      if (list) list.push(appt);
      else map.set(appt.staff.id, [appt]);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      );
    }
    return map;
  }, [appointments]);

  const columnLayoutByStaffId = useMemo(() => {
    const map = new Map<
      string,
      {
        colAppts: Appointment[];
        colBlocks: ConsecutiveAppointmentGroup<Appointment>[];
        overlapRegions: ReturnType<typeof getOverlapRegions>;
      }
    >();
    for (const s of visibleStaff) {
      const colAppts = appointmentsByStaffId.get(s.id) ?? [];
      const colBlocks = groupConsecutiveClientAppointments(colAppts);
      map.set(s.id, {
        colAppts,
        colBlocks,
        overlapRegions: getOverlapRegions(
          date,
          colBlocks.map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
        ),
      });
    }
    return map;
  }, [visibleStaff, appointmentsByStaffId, date]);

  const gridHeight = timeLabels.length * slotHeightPx;
  const expandColumns = fillViewport || resourceKind !== "all";

  const canDrop = useCallback(
    (staffId: string, startMinutes: number, durationMinutes: number) => {
      if (!staff.find((s) => s.id === staffId)) return false;
      return startMinutes >= 0 && durationMinutes > 0;
    },
    [staff],
  );

  const resolveDropTarget = useCallback(
    (clientX: number, clientY: number) => {
      for (const s of visibleStaff) {
        if (collapsedIds.has(s.id)) continue;
        const el = columnRefs.current.get(s.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (
          clientX < rect.left ||
          clientX > rect.right ||
          clientY < rect.top ||
          clientY > rect.bottom
        ) {
          continue;
        }
        const relY = Math.max(0, Math.min(clientY - rect.top, gridHeight - 1));
        const slotIndex = Math.floor(relY / slotHeightPx);
        const minutes = bounds.start + slotIndex * gridStep;
        return { staffId: s.id, minutes };
      }
      return null;
    },
    [visibleStaff, collapsedIds, gridHeight, bounds.start, gridStep, slotHeightPx],
  );

  const resolveDurationFromPointer = useCallback(
    (
      clientY: number,
      staffId: string,
      startMinutes: number,
      cellMinutes: number,
    ) => {
      const el = columnRefs.current.get(staffId);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const relY = Math.max(0, Math.min(clientY - rect.top, gridHeight));
      const slotIndex = Math.max(1, Math.ceil(relY / slotHeightPx));
      const endMinutes = bounds.start + slotIndex * gridStep;
      const rawDuration = Math.max(gridStep, endMinutes - startMinutes);
      const maxDuration = bounds.end - startMinutes;
      const capped = Math.min(rawDuration, maxDuration);
      const cell = cellMinutes > 0 ? cellMinutes : gridStep;
      return snapDurationToCell(capped, cell, { minCells: 1, maxMinutes: maxDuration });
    },
    [gridHeight, bounds.start, bounds.end, gridStep, slotHeightPx],
  );

  const moveGroupBlock = useCallback(
    (group: Appointment[], staffId: string, startMinutes: number) => {
      const first = group[0];
      if (!first || isMutatingRef.current) return;
      const total = groupTotalMinutes(group);
      if (!canDrop(staffId, startMinutes, total)) return;

      onOptimisticMove?.(group, staffId, startMinutes);

      isMutatingRef.current = true;
      const scrollEl = scrollContainerRef.current;
      const { left: scrollLeft, top: scrollTop } =
        captureJournalScrollState(scrollEl);

      void (async () => {
        try {
          await moveGroupAppointments(
            toGroupRefs(group),
            isoAtMinutes(date, startMinutes),
            staffId,
          );
          pendingScrollRestore.current = { left: scrollLeft, top: scrollTop };
          await onMoved();
        } catch (e) {
          onOptimisticRollback?.();
          onActionError?.(
            e instanceof Error ? e.message : "Не удалось переместить запись",
          );
        } finally {
          isMutatingRef.current = false;
        }
      })();
    },
    [canDrop, date, onMoved, onActionError, onOptimisticMove, onOptimisticRollback],
  );

  const resizeGroupBlock = useCallback(
    (group: Appointment[], durationMinutes: number) => {
      const first = group[0];
      if (!first || isMutatingRef.current) return;
      const currentTotal = groupTotalMinutes(group);
      if (durationMinutes === currentTotal) return;

      onOptimisticResize?.(group, durationMinutes);

      isMutatingRef.current = true;
      const scrollEl = scrollContainerRef.current;
      const { left: scrollLeft, top: scrollTop } =
        captureJournalScrollState(scrollEl);

      void (async () => {
        try {
          await resizeGroupAppointments(
            toGroupRefs(group),
            durationMinutes,
            groupCreateTemplate(first),
          );
          pendingScrollRestore.current = { left: scrollLeft, top: scrollTop };
          await onMoved();
        } catch (e) {
          onOptimisticRollback?.();
          onActionError?.(
            e instanceof Error ? e.message : "Не удалось изменить длительность",
          );
        } finally {
          isMutatingRef.current = false;
        }
      })();
    },
    [onMoved, onActionError, onOptimisticResize, onOptimisticRollback],
  );

  useEffect(() => {
    if (!pendingScrollRestore.current) return;
    const { left, top } = pendingScrollRestore.current;
    pendingScrollRestore.current = null;
    const scrollEl = scrollContainerRef.current;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        restoreJournalScrollState(scrollEl, left, top);
      });
    });
  }, [appointments]);

  const moveGroupBlockRef = useRef(moveGroupBlock);
  moveGroupBlockRef.current = moveGroupBlock;
  const resizeGroupBlockRef = useRef(resizeGroupBlock);
  resizeGroupBlockRef.current = resizeGroupBlock;

  useEffect(() => {
    if (!isTracking) return;

    function onPointerMove(e: PointerEvent) {
      if (dragRef.current || resizeRef.current || pointerStartRef.current) {
        e.preventDefault();
      }

      if (resizeRef.current) {
        const current = resizeRef.current;
        const nextDuration = resolveDurationFromPointer(
          e.clientY,
          current.staffId,
          current.startMinutes,
          current.cellMinutes,
        );
        if (nextDuration === null || nextDuration === current.durationMinutes) {
          return;
        }
        const height = (nextDuration / gridStep) * slotHeightPx;
        setResize((prev) =>
          prev
            ? {
                ...prev,
                durationMinutes: nextDuration,
                height,
              }
            : prev,
        );
        return;
      }

      const pending = pointerStartRef.current;
      const current = dragRef.current;

      if (pending && !current) {
        const dist = Math.hypot(
          e.clientX - pending.x,
          e.clientY - pending.y,
        );
        if (dist < DRAG_THRESHOLD_PX) return;

        const startMin = minutesFromIso(date, pending.appt.startAt);
        const initialMinutes = startMin ?? bounds.start;
        setDrag({
          appt: pending.appt,
          group: pending.group,
          staffId: pending.appt.staff.id,
          startMinutes: initialMinutes,
          height: pending.height,
          valid: canDrop(
            pending.appt.staff.id,
            initialMinutes,
            groupTotalMinutes(pending.group),
          ),
        });
        setPointerStart(null);
        return;
      }

      if (!dragRef.current) return;
      const target = resolveDropTarget(e.clientX, e.clientY);
      if (!target) return;

      setDrag((prev) => {
        if (!prev) return prev;
        if (
          prev.staffId === target.staffId &&
          prev.startMinutes === target.minutes
        ) {
          return prev;
        }
        const valid = canDrop(
          target.staffId,
          target.minutes,
          groupTotalMinutes(prev.group),
        );
        return {
          ...prev,
          staffId: target.staffId,
          startMinutes: target.minutes,
          valid,
        };
      });
    }

    function onPointerUp() {
      const current = dragRef.current;
      const resizing = resizeRef.current;
      const pending = pointerStartRef.current;

      window.getSelection()?.removeAllRanges();

      if (resizing) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 400);
        const { group, durationMinutes } = resizing;
        const changed = durationMinutes !== groupTotalMinutes(group);
        setResize(null);
        setPointerStart(null);
        if (changed) {
          void resizeGroupBlockRef.current(group, durationMinutes);
        }
        return;
      }

      if (current) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 400);

        const { group, staffId, startMinutes, valid } = current;
        setDrag(null);
        setPointerStart(null);

        if (valid) {
          const originMin = minutesFromIso(date, group[0].startAt);
          const moved =
            staffId !== group[0].staff.id || originMin !== startMinutes;
          if (moved) {
            void moveGroupBlockRef.current(group, staffId, startMinutes);
          }
        }
        return;
      }
      if (pending) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 400);
        onAppointmentClick(pending.appt, pending.group);
        setPointerStart(null);
      }
    }

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [
    isTracking,
    bounds.start,
    canDrop,
    date,
    onAppointmentClick,
    resolveDropTarget,
    resolveDurationFromPointer,
  ]);

  useEffect(() => {
    if (!isTracking) return;

    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    if (drag) document.body.style.cursor = "grabbing";
    if (resize) document.body.style.cursor = "ns-resize";

    function preventSelect(e: Event) {
      e.preventDefault();
    }
    document.addEventListener("selectstart", preventSelect);

    return () => {
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      document.removeEventListener("selectstart", preventSelect);
      window.getSelection()?.removeAllRanges();
    };
  }, [isTracking, drag, resize]);

  function handleColumnClick(
    e: React.MouseEvent<HTMLDivElement>,
    staffRow: StaffRow,
  ) {
    if (suppressClickRef.current || drag || resize || pointerStart) return;
    if ((e.target as HTMLElement).closest("[data-appointment-block]")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const slotIndex = Math.floor(y / slotHeightPx);
    const minutes = bounds.start + slotIndex * gridStep;

    onSlotClick({
      branchId: staffRow.branchId,
      staffId: staffRow.id,
      staffName: staffRow.name,
      startAt: isoAtMinutes(date, minutes),
      durationMinutes: Math.max(gridStep * 2, 30),
    });
  }

  function apptName(a: Appointment) {
    return (
      [a.client.firstName, a.client.lastName].filter(Boolean).join(" ") ||
      a.client.phone
    );
  }

  function renderDragPreview(d: DragState) {
    const duration = groupTotalMinutes(d.group);
    const endMin = d.startMinutes + duration;
    const name = apptName(d.appt);
    return (
      <>
        <div
          className={`pointer-events-none absolute left-0 right-0 z-20 border-2 border-dashed ${
            d.valid
              ? "border-lime-500 bg-lime-200/40"
              : "border-red-400 bg-red-200/40"
          }`}
          style={{
            top: topPxFromMinutes(d.startMinutes, bounds.start, gridStep, slotHeightPx),
            height: d.height,
          }}
        />
        <div
          className={`pointer-events-none absolute left-1 right-1 z-30 overflow-hidden rounded px-1.5 py-1 text-[11px] leading-tight shadow-lg ring-2 ${
            d.valid ? "ring-lime-500" : "ring-red-400"
          } ${statusBlockClass(d.appt.status)}`}
          style={{
            top: topPxFromMinutes(d.startMinutes, bounds.start, gridStep, slotHeightPx),
            height: d.height,
            opacity: 0.95,
          }}
        >
          <div className="flex items-center gap-1">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(d.appt.status)}`}
            />
            <span className="font-semibold">
              {minutesToTime(d.startMinutes)} – {minutesToTime(endMin)}
            </span>
          </div>
          <span className="block truncate font-medium">{name}</span>
        </div>
      </>
    );
  }


  function syncHeaderScrollLeft(scrollLeft: number) {
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = scrollLeft;
    }
  }

  function renderStaffHeader(
    s: StaffRow,
    staffLabel: string,
    collapsed: boolean,
    colAppts: Appointment[],
  ) {
    return (
      <div
        key={`header-${s.id}`}
        className={staffColumnWidthClass(collapsed, expandColumns, "relative bg-white", fillViewport)}
        style={{ height: HEADER_HEIGHT_PX }}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={() => toggleColumnCollapsed(s.id)}
            className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded px-0.5 hover:bg-slate-50"
            title={`Развернуть: ${staffLabel}`}
          >
            <span className="text-sm font-semibold text-lime-700">›</span>
            <span
              className="max-h-[36px] overflow-hidden text-[9px] font-medium leading-tight text-slate-600"
              style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
            >
              {collapsedStaffLabel(s.name)}
            </span>
            {colAppts.length > 0 && (
              <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-lime-500" />
            )}
          </button>
        ) : (
          <div className="flex h-full items-center gap-1 overflow-hidden px-1.5">
            <p
              className="min-w-0 shrink truncate text-[11px] font-semibold leading-none text-slate-800"
              title={staffLabel}
            >
              {staffLabel}
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!drag) setScheduleModal({ staffId: s.id, staffName: staffLabel });
              }}
              className="shrink-0 text-[10px] leading-none text-sky-600 hover:underline"
            >
              график
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleColumnCollapsed(s.id);
              }}
              className="ml-auto shrink-0 rounded px-0.5 text-xs leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Свернуть колонку"
              aria-label={`Свернуть ${staffLabel}`}
            >
              −
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
      <div className="select-none">
      {visibleStaff.length === 0 && (
        <p
          className={cn(
            "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800",
            fillViewport ? "mb-2 shrink-0" : "mb-3",
          )}
        >
          {staff.length === 0
            ? "Нет ресурсов для выбранного филиала. Выберите филиал или проверьте загрузку данных."
            : "Нет ресурсов для выбранного фильтра."}
        </p>
      )}

      {!fillViewport && (
        <>
      <p className="mb-2 text-xs text-slate-400">
        Удерживайте запись и перетащите в нужный слот — можно накладывать на другие записи.
        Потяните нижний край записи, чтобы изменить длительность.
        Оранжевая заливка — пересечение по времени. Клик без движения — редактирование.
      </p>

      <p className="mb-2 hidden text-xs text-slate-400 md:block">
        {expandColumns
          ? "Прокручивайте сетку для просмотра всего дня"
          : "Листайте вправо для просмотра всех ресурсов"}
      </p>
        </>
      )}

      <div className="admin-journal-grid-root w-full max-w-full">
        <div
          ref={headerScrollRef}
          className="admin-journal-grid-header sticky top-0 z-40 w-full shrink-0 overflow-x-hidden rounded-t-lg border border-b-0 border-slate-200 bg-white shadow-sm"
        >
          <div className={`flex ${expandColumns ? "w-full min-w-0" : "min-w-max"}`}>
            <div
              className="w-16 shrink-0 border-r border-slate-200 bg-slate-50"
              style={{ height: HEADER_HEIGHT_PX }}
            />
            {visibleStaff.map((s) => {
              const staffLabel = journalStaffDisplayName(s.name);
              const collapsed = collapsedIds.has(s.id);
              const colAppts = columnLayoutByStaffId.get(s.id)?.colAppts ?? [];
              return renderStaffHeader(s, staffLabel, collapsed, colAppts);
            })}
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          onScroll={(e) => syncHeaderScrollLeft(e.currentTarget.scrollLeft)}
          className={cn(
            "admin-journal-grid-scroll rounded-b-lg border border-slate-200 bg-white shadow-sm [-webkit-overflow-scrolling:touch]",
            fillViewport
              ? "overflow-x-auto max-w-full"
              : cn(
                  "min-h-0 overflow-auto",
                  isDesktop
                    ? "h-[calc(100dvh-11rem)] max-h-[calc(100dvh-11rem)]"
                    : "max-h-[var(--admin-journal-grid-max-h,min(72vh,calc(100dvh-14rem)))] min-h-[280px]",
                ),
          )}
        >
        <div className={`flex ${expandColumns ? "w-full min-w-0" : "min-w-max"}`}>
          <div className="sticky left-0 z-30 w-16 shrink-0 border-r border-slate-200 bg-slate-50">
            <div className="relative" style={{ height: gridHeight }}>
              {timeLabels.map((m) => (
                <div
                  key={m}
                  className={`absolute right-1.5 text-xs ${
                    drag && drag.startMinutes === m
                      ? "font-bold text-lime-700"
                      : "text-slate-400"
                  }`}
                  style={{
                    top: topPxFromMinutes(m, bounds.start, gridStep, slotHeightPx),
                    height: slotHeightPx,
                  }}
                >
                  {formatMinutesLabel(m, gridStep)}
                </div>
              ))}
              {drag && (
                <div
                  className="absolute right-0 z-30 rounded-l bg-lime-600 px-1 py-0.5 text-[10px] font-semibold text-white"
                  style={{
                    top: topPxFromMinutes(drag.startMinutes, bounds.start, gridStep, slotHeightPx),
                  }}
                >
                  {minutesToTime(drag.startMinutes)}
                </div>
              )}
            </div>
          </div>

          {visibleStaff.map((s) => {
            const staffLabel = journalStaffDisplayName(s.name);
            const collapsed = collapsedIds.has(s.id);
            const layout = columnLayoutByStaffId.get(s.id);
            const colAppts = layout?.colAppts ?? [];
            const colBlocks = layout?.colBlocks ?? [];
            const overlapRegions = layout?.overlapRegions ?? [];
            const isDropColumn = drag?.staffId === s.id;

            return (
              <div
                key={s.id}
                className={staffColumnWidthClass(
                  collapsed,
                  expandColumns,
                  isDropColumn && drag?.valid ? "bg-lime-50/30" : "",
                  fillViewport,
                )}
              >
                {collapsed ? (
                  <div
                    className="bg-slate-50"
                    style={{ height: gridHeight }}
                    aria-hidden
                  />
                ) : (
                <div
                  ref={(el) => {
                    if (el) columnRefs.current.set(s.id, el);
                    else columnRefs.current.delete(s.id);
                  }}
                  className="relative cursor-pointer overflow-hidden"
                  style={{ height: gridHeight, touchAction: "pan-y" }}
                  onClickCapture={(e) => {
                    if (suppressClickRef.current) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                  onClick={(e) => handleColumnClick(e, s)}
                >
                  {timeLabels.map((m) => {
                    const working = isStaffWorkingAt(s.schedules, weekday, m);
                    const isTargetSlot =
                      drag?.staffId === s.id && drag.startMinutes === m;
                    return (
                      <div
                        key={m}
                        className={`absolute left-0 right-0 border-b border-slate-100 ${
                          working ? "bg-white" : "bg-slate-100"
                        } ${isTargetSlot ? "bg-lime-100/80" : ""}`}
                        style={{
                          top: topPxFromMinutes(m, bounds.start, gridStep, slotHeightPx),
                          height: slotHeightPx,
                        }}
                      />
                    );
                  })}

                  {drag && isDropColumn && renderDragPreview(drag)}

                  {overlapRegions.map((region, idx) => (
                    <div
                      key={`overlap-${idx}`}
                      className="pointer-events-none absolute left-0 right-0 z-[8] bg-orange-400/50 ring-1 ring-inset ring-orange-500/70"
                      style={{
                        top: topPxFromMinutes(region.start, bounds.start, gridStep, slotHeightPx),
                        height:
                          ((region.end - region.start) / gridStep) *
                          slotHeightPx,
                      }}
                      title="Пересечение записей"
                    />
                  ))}

                  {colBlocks.map((block) => {
                    const a = block.appointments[0];
                    const layout = getAppointmentLayout(
                      date,
                      bounds,
                      block.startAt,
                      block.endAt,
                      gridStep,
                      slotHeightPx,
                    );
                    if (!layout) return null;
                    const name = apptName(a);
                    const showStatus = layout.height >= slotHeightPx * 1.65;
                    const isDragging =
                      drag?.group.some((g) =>
                        block.appointments.some((b) => b.id === g.id),
                      ) ?? false;
                    const isResizing =
                      resize?.group.some((g) =>
                        block.appointments.some((b) => b.id === g.id),
                      ) ?? false;
                    const isPending = pointerStart?.group.some((g) =>
                      block.appointments.some((b) => b.id === g.id),
                    );
                    const overlapSegments = getAppointmentOverlapSegments(
                      date,
                      block.startAt,
                      block.endAt,
                      colBlocks
                        .filter((b) => b.id !== block.id)
                        .map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
                    );
                    const myStartMin = minutesFromIso(date, block.startAt);
                    const myDuration =
                      isResizing && resize
                        ? resize.durationMinutes
                        : block.durationMinutes;
                    const blockHeight =
                      isResizing && resize ? resize.height : layout.height;
                    const blockEndMin =
                      myStartMin !== null ? myStartMin + myDuration : null;

                    return (
                      <div
                        key={a.id}
                        data-appointment-block
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          if (isMutatingRef.current) return;
                          if ((e.target as HTMLElement).closest("[data-resize-handle]")) {
                            return;
                          }
                          e.preventDefault();
                          e.stopPropagation();
                          setPointerStart({
                            appt: a,
                            group: block.appointments,
                            x: e.clientX,
                            y: e.clientY,
                            height: layout.height,
                          });
                        }}
                        onDragStart={(e) => e.preventDefault()}
                        draggable={false}
                        className={`absolute left-1 right-1 touch-none select-none overflow-hidden rounded px-1.5 py-1 text-[11px] leading-tight shadow-sm ${
                          isDragging
                            ? "z-20 cursor-grabbing opacity-25"
                            : isResizing
                              ? "z-[12] ring-2 ring-sky-400"
                              : isPending
                                ? "z-[11] cursor-grab ring-2 ring-slate-300"
                                : "z-10 cursor-grab hover:ring-1 hover:ring-slate-300"
                        } ${statusBlockClass(a.status)}`}
                        style={{ top: layout.top, height: blockHeight }}
                        title={`${statusLabel(a.status)} — перетащите или потяните нижний край`}
                      >
                        {overlapSegments.map((seg, segIdx) => {
                          if (myStartMin === null || myDuration <= 0) return null;
                          const segTop =
                            ((seg.start - myStartMin) / myDuration) * 100;
                          const segHeight =
                            ((seg.end - seg.start) / myDuration) * 100;
                          return (
                            <div
                              key={segIdx}
                              className="pointer-events-none absolute inset-x-0 bg-orange-500/65 ring-1 ring-inset ring-orange-600/80"
                              style={{
                                top: `${segTop}%`,
                                height: `${segHeight}%`,
                              }}
                            />
                          );
                        })}
                        <div className="relative z-[1]">
                        <div className="flex items-center gap-1">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(a.status)}`}
                          />
                          <span className="font-semibold">
                            {formatTimeMinsk(block.startAt)} –{" "}
                            {blockEndMin !== null ? minutesToTime(blockEndMin) : ""}
                          </span>
                        </div>
                        <span className="block truncate font-medium">{name}</span>
                        {showStatus && (
                          <span className="block truncate opacity-75">
                            {statusLabel(a.status)}
                          </span>
                        )}
                        </div>
                        <div
                          data-resize-handle
                          className="group/resize absolute inset-x-0 bottom-0 z-[2] flex h-1.5 max-h-[22%] items-end cursor-ns-resize hover:bg-sky-500/10"
                          title="Потяните для изменения длительности"
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            if (isMutatingRef.current) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const startMin = minutesFromIso(date, block.startAt);
                            if (startMin === null) return;
                            const cellMinutes = resizeStepForGroup(
                              block.appointments,
                              gridStep,
                            );
                            setResize({
                              group: block.appointments,
                              staffId: s.id,
                              startMinutes: startMin,
                              durationMinutes: block.durationMinutes,
                              cellMinutes,
                              height: layout.height,
                            });
                            setPointerStart(null);
                            setDrag(null);
                          }}
                        >
                          <div className="h-px w-full bg-black/20 group-hover/resize:bg-sky-500/40" />
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      </div>

      <StaffDayScheduleModal
        open={scheduleModal !== null}
        staffId={scheduleModal?.staffId ?? ""}
        staffName={scheduleModal?.staffName ?? ""}
        date={date}
        onClose={() => setScheduleModal(null)}
        onSaved={() => {
          onScheduleSaved?.();
        }}
      />
    </div>
  );
}
