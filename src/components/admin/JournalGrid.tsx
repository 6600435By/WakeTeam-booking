"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatMinutesLabel,
  generateTimeLabels,
  getAppointmentLayout,
  getAppointmentOverlapSegments,
  getGridBounds,
  getOverlapRegions,
  getStaffRule,
  groupConsecutiveClientAppointments,
  isoAtMinutes,
  isStaffWorkingAt,
  minutesFromIso,
  minutesToTime,
  SLOT_HEIGHT_PX,
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
  type JournalResourceKind,
} from "@/lib/journal-resources";

const DRAG_THRESHOLD_PX = 6;

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
  staffId: string;
  startMinutes: number;
  height: number;
  valid: boolean;
};

type ResizeState = {
  appt: Appointment;
  staffId: string;
  startMinutes: number;
  durationMinutes: number;
  height: number;
};

type PointerStart = {
  appt: Appointment;
  x: number;
  y: number;
  height: number;
};

type Props = {
  date: string;
  weekday: number;
  branchId: string;
  staff: StaffRow[];
  resourceKind?: JournalResourceKind;
  appointments: Appointment[];
  gridStep: JournalGridStep;
  onSlotClick: (initial: ModalInitial) => void;
  onAppointmentClick: (appt: Appointment) => void;
  onMoved: () => void | Promise<void>;
};

function collapsedStaffLabel(name: string): string {
  const match = name.match(/№\s*(\d+)/);
  if (match) return `№${match[1]}`;
  return name.length > 6 ? `${name.slice(0, 5)}…` : name;
}

function topPxFromMinutes(
  minutes: number,
  boundsStart: number,
  slotMinutes: number,
): number {
  return ((minutes - boundsStart) / slotMinutes) * SLOT_HEIGHT_PX;
}

export function JournalGrid({
  date,
  weekday,
  branchId,
  staff,
  resourceKind = "all",
  appointments,
  gridStep,
  onSlotClick,
  onAppointmentClick,
  onMoved,
}: Props) {
  const [hideInactive, setHideInactive] = useState(true);
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
  const pendingScrollRestore = useRef<{ left: number; top: number } | null>(
    null,
  );
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

  const visibleStaff = useMemo(() => {
    const list = staff.filter((s) => !branchId || s.branchId === branchId);
    let filtered = list.filter((s) => staffMatchesResourceFilter(s, resourceKind));
    if (!hideInactive) return filtered;
    return filtered.filter((s) => getStaffRule(s.schedules, weekday));
  }, [staff, branchId, hideInactive, weekday, resourceKind]);

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

  const gridHeight = timeLabels.length * SLOT_HEIGHT_PX;

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
        const slotIndex = Math.floor(relY / SLOT_HEIGHT_PX);
        const minutes = bounds.start + slotIndex * gridStep;
        return { staffId: s.id, minutes };
      }
      return null;
    },
    [visibleStaff, collapsedIds, gridHeight, bounds.start, gridStep],
  );

  const resolveDurationFromPointer = useCallback(
    (clientY: number, staffId: string, startMinutes: number) => {
      const el = columnRefs.current.get(staffId);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const relY = Math.max(0, Math.min(clientY - rect.top, gridHeight));
      const slotIndex = Math.max(1, Math.ceil(relY / SLOT_HEIGHT_PX));
      const endMinutes = bounds.start + slotIndex * gridStep;
      const duration = Math.max(gridStep, endMinutes - startMinutes);
      const maxDuration = bounds.end - startMinutes;
      return Math.min(duration, maxDuration);
    },
    [gridHeight, bounds.start, bounds.end, gridStep],
  );

  const moveAppointment = useCallback(
    async (apptId: string, staffId: string, startMinutes: number) => {
      const appt = appointments.find((a) => a.id === apptId);
      if (!appt) return;
      if (!canDrop(staffId, startMinutes, appt.durationMinutes)) return;

      const scrollEl = scrollContainerRef.current;
      const scrollLeft = scrollEl?.scrollLeft ?? 0;
      const scrollTop = window.scrollY;

      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId,
          startAt: isoAtMinutes(date, startMinutes),
          durationMinutes: appt.durationMinutes,
        }),
      });
      if (res.ok) {
        pendingScrollRestore.current = { left: scrollLeft, top: scrollTop };
        await onMoved();
      }
    },
    [appointments, canDrop, date, onMoved],
  );

  const resizeAppointment = useCallback(
    async (apptId: string, durationMinutes: number) => {
      const appt = appointments.find((a) => a.id === apptId);
      if (!appt || durationMinutes === appt.durationMinutes) return;

      const scrollEl = scrollContainerRef.current;
      const scrollLeft = scrollEl?.scrollLeft ?? 0;
      const scrollTop = window.scrollY;

      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes }),
      });
      if (res.ok) {
        pendingScrollRestore.current = { left: scrollLeft, top: scrollTop };
        await onMoved();
      }
    },
    [appointments, onMoved],
  );

  const resizeAppointmentRef = useRef(resizeAppointment);
  resizeAppointmentRef.current = resizeAppointment;

  useEffect(() => {
    if (!pendingScrollRestore.current) return;
    const { left, top } = pendingScrollRestore.current;
    pendingScrollRestore.current = null;
    const scrollEl = scrollContainerRef.current;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollEl) scrollEl.scrollLeft = left;
        window.scrollTo(0, top);
      });
    });
  }, [appointments]);

  const moveAppointmentRef = useRef(moveAppointment);
  moveAppointmentRef.current = moveAppointment;

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
        );
        if (nextDuration === null || nextDuration === current.durationMinutes) {
          return;
        }
        const height = (nextDuration / gridStep) * SLOT_HEIGHT_PX;
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
          staffId: pending.appt.staff.id,
          startMinutes: initialMinutes,
          height: pending.height,
          valid: canDrop(
            pending.appt.staff.id,
            initialMinutes,
            pending.appt.durationMinutes,
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
          prev.appt.durationMinutes,
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
        if (resizing.durationMinutes !== resizing.appt.durationMinutes) {
          void resizeAppointmentRef.current(
            resizing.appt.id,
            resizing.durationMinutes,
          );
        }
        setResize(null);
        setPointerStart(null);
        return;
      }

      if (current) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 400);

        if (current.valid) {
          const originMin = minutesFromIso(date, current.appt.startAt);
          const moved =
            current.staffId !== current.appt.staff.id ||
            originMin !== current.startMinutes;
          if (moved) {
            void moveAppointmentRef.current(
              current.appt.id,
              current.staffId,
              current.startMinutes,
            );
          }
        }
        setDrag(null);
        setPointerStart(null);
        return;
      }
      if (pending) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 400);
        onAppointmentClick(pending.appt);
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
    const slotIndex = Math.floor(y / SLOT_HEIGHT_PX);
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
    const endMin = d.startMinutes + d.appt.durationMinutes;
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
            top: topPxFromMinutes(d.startMinutes, bounds.start, gridStep),
            height: d.height,
          }}
        />
        <div
          className={`pointer-events-none absolute left-0.5 right-0.5 z-30 overflow-hidden rounded px-1 py-0.5 text-[10px] leading-tight shadow-lg ring-2 ${
            d.valid ? "ring-lime-500" : "ring-red-400"
          } ${statusBlockClass(d.appt.status)}`}
          style={{
            top: topPxFromMinutes(d.startMinutes, bounds.start, gridStep),
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

  return (
      <div className="select-none">
      <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={hideInactive}
          onChange={(e) => setHideInactive(e.target.checked)}
        />
        Скрыть нерабочие колонки
      </label>

      {visibleStaff.length === 0 && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {staff.length === 0
            ? "Нет ресурсов для выбранного филиала. Выберите филиал или проверьте загрузку данных."
            : "Нет ресурсов со сменой в этот день. Снимите «Скрыть нерабочие колонки» или выберите другой день."}
        </p>
      )}

      <p className="mb-2 text-xs text-slate-400">
        Удерживайте запись и перетащите в нужный слот — можно накладывать на другие записи.
        Потяните нижний край записи, чтобы изменить длительность.
        Оранжевая заливка — пересечение по времени. Клик без движения — редактирование.
      </p>

      <p className="mb-2 hidden text-xs text-slate-400 md:block">
        Листайте вправо для просмотра всех ресурсов
      </p>

      <div
        ref={scrollContainerRef}
        className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm [-webkit-overflow-scrolling:touch]"
      >
        <div className="flex min-w-max">
          <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-slate-200 bg-slate-50">
            <div className="h-[52px] border-b border-slate-200" />
            <div className="relative" style={{ height: gridHeight }}>
              {timeLabels.map((m) => (
                <div
                  key={m}
                  className={`absolute right-1 text-[10px] ${
                    drag && drag.startMinutes === m
                      ? "font-bold text-lime-700"
                      : "text-slate-400"
                  }`}
                  style={{
                    top: topPxFromMinutes(m, bounds.start, gridStep),
                    height: SLOT_HEIGHT_PX,
                  }}
                >
                  {formatMinutesLabel(m, gridStep)}
                </div>
              ))}
              {drag && (
                <div
                  className="absolute right-0 z-30 rounded-l bg-lime-600 px-1 py-0.5 text-[10px] font-semibold text-white"
                  style={{
                    top: topPxFromMinutes(drag.startMinutes, bounds.start, gridStep),
                  }}
                >
                  {minutesToTime(drag.startMinutes)}
                </div>
              )}
            </div>
          </div>

          {visibleStaff.map((s) => {
            const rule = getStaffRule(s.schedules, weekday);
            const collapsed = collapsedIds.has(s.id);
            const colAppts = appointments
              .filter((a) => a.staff.id === s.id)
              .sort(
                (a, b) =>
                  new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
              );
            const colBlocks = groupConsecutiveClientAppointments(colAppts);
            const overlapRegions = getOverlapRegions(date, colAppts);
            const isDropColumn = drag?.staffId === s.id;

            return (
              <div
                key={s.id}
                className={`shrink-0 border-r border-slate-200 last:border-r-0 ${
                  collapsed ? "w-10" : "w-28 sm:w-32 md:w-36"
                } ${isDropColumn && drag?.valid ? "bg-lime-50/30" : ""}`}
              >
                <div
                  className={`relative border-b border-slate-200 ${
                    collapsed
                      ? "flex h-[52px] flex-col items-center justify-center gap-0.5 px-0.5"
                      : "h-[52px] px-1 py-1 text-center"
                  }`}
                >
                  {collapsed ? (
                    <button
                      type="button"
                      onClick={() => toggleColumnCollapsed(s.id)}
                      className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded hover:bg-slate-50"
                      title={`Развернуть: ${s.name}`}
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
                    <>
                      <div className="flex items-start justify-between gap-0.5">
                        <p className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold leading-tight text-slate-800">
                          {s.name}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumnCollapsed(s.id);
                          }}
                          className="shrink-0 rounded px-0.5 text-sm leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="Свернуть колонку"
                          aria-label={`Свернуть ${s.name}`}
                        >
                          −
                        </button>
                      </div>
                      {rule && (
                        <p className="text-[10px] text-emerald-600">
                          {rule.timeFrom} – {rule.timeTo}
                        </p>
                      )}
                      <Link
                        href={`/admin/staff/${s.id}/schedule`}
                        className="text-[10px] text-sky-600 hover:underline"
                        onClick={(e) => drag && e.preventDefault()}
                      >
                        график
                      </Link>
                    </>
                  )}
                </div>

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
                          top: topPxFromMinutes(m, bounds.start, gridStep),
                          height: SLOT_HEIGHT_PX,
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
                        top: topPxFromMinutes(region.start, bounds.start, gridStep),
                        height:
                          ((region.end - region.start) / gridStep) *
                          SLOT_HEIGHT_PX,
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
                    );
                    if (!layout) return null;
                    const name = apptName(a);
                    const showStatus = layout.height >= 44;
                    const isDragging = drag?.appt.id === a.id;
                    const isResizing = resize?.appt.id === a.id;
                    const isPending = pointerStart?.appt.id === a.id;
                    const overlapSegments = getAppointmentOverlapSegments(
                      date,
                      block.startAt,
                      block.endAt,
                      colAppts.filter((o) => !block.appointments.some((g) => g.id === o.id)),
                    );
                    const myStartMin = minutesFromIso(date, block.startAt);
                    const myDuration = isResizing
                      ? resize.durationMinutes
                      : block.durationMinutes;
                    const blockHeight = isResizing ? resize.height : layout.height;
                    const blockEndMin =
                      myStartMin !== null ? myStartMin + myDuration : null;

                    return (
                      <div
                        key={a.id}
                        data-appointment-block
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          if ((e.target as HTMLElement).closest("[data-resize-handle]")) {
                            return;
                          }
                          e.preventDefault();
                          e.stopPropagation();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          setPointerStart({
                            appt: a,
                            x: e.clientX,
                            y: e.clientY,
                            height: layout.height,
                          });
                        }}
                        onPointerUp={(e) => {
                          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                          }
                        }}
                        onDragStart={(e) => e.preventDefault()}
                        draggable={false}
                        className={`absolute left-0.5 right-0.5 touch-none select-none overflow-hidden rounded px-1 py-0.5 text-[10px] leading-tight shadow-sm ${
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
                          className="absolute inset-x-0 bottom-0 z-[2] h-2.5 cursor-ns-resize bg-black/10 hover:bg-sky-500/30"
                          title="Потяните для изменения длительности"
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const startMin = minutesFromIso(date, a.startAt);
                            if (startMin === null) return;
                            (e.currentTarget as HTMLElement).setPointerCapture(
                              e.pointerId,
                            );
                            setResize({
                              appt: a,
                              staffId: s.id,
                              startMinutes: startMin,
                              durationMinutes: a.durationMinutes,
                              height: layout.height,
                            });
                            setPointerStart(null);
                            setDrag(null);
                          }}
                          onPointerUp={(e) => {
                            if (
                              (e.currentTarget as HTMLElement).hasPointerCapture(
                                e.pointerId,
                              )
                            ) {
                              (e.currentTarget as HTMLElement).releasePointerCapture(
                                e.pointerId,
                              );
                            }
                          }}
                        />
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
  );
}
