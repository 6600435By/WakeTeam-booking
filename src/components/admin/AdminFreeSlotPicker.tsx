"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAdminSlots,
  formatAdminSlotTime,
  type AdminSlotsResponse,
  type AdminSupSlot,
  type AdminWakeSlot,
} from "@/lib/admin/admin-slots-client";
import { cn } from "@/lib/utils";

export type AdminSlotPick = {
  startAt: string;
  staffId?: string;
  staffName?: string;
};

type StaffOption = { id: string; name: string };

type Props = {
  serviceId: string;
  serviceKind: string;
  date: string;
  durationMinutes?: number;
  staffId?: string;
  staffOptions?: StaffOption[];
  selectedStartAt?: string;
  excludeAppointmentId?: string;
  onPick: (pick: AdminSlotPick) => void;
  className?: string;
  compact?: boolean;
};

type CombinedWakeSlot = AdminWakeSlot & { staffLabel?: string };

export function AdminFreeSlotPicker({
  serviceId,
  serviceKind,
  date,
  durationMinutes,
  staffId,
  staffOptions = [],
  selectedStartAt,
  excludeAppointmentId,
  onPick,
  className,
  compact = false,
}: Props) {
  const isSup = serviceKind === "sup";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AdminSlotsResponse | null>(null);

  const load = useCallback(async () => {
    if (!serviceId || !date) return;

    setLoading(true);
    setError("");
    try {
      if (isSup) {
        const result = await fetchAdminSlots({
          serviceId,
          date,
          durationMinutes,
          excludeAppointmentId,
        });
        setData(result);
        return;
      }

      const targets =
        staffId
          ? staffOptions.filter((st) => st.id === staffId)
          : staffOptions;

      if (targets.length === 0) {
        setData({ kind: "wake", slots: [], allowedDurations: [] });
        return;
      }

      if (targets.length > 1) {
        const results = await Promise.all(
          targets.map(async (st) => {
            const result = await fetchAdminSlots({
              serviceId,
              date,
              staffId: st.id,
              durationMinutes,
              excludeAppointmentId,
            });
            return result.kind === "wake"
              ? result.slots.map((slot) => ({
                  ...slot,
                  staffLabel: st.name,
                }))
              : [];
          }),
        );
        const merged = results.flat().sort((a, b) =>
          a.startAt.localeCompare(b.startAt),
        );
        setData({
          kind: "wake",
          slots: merged,
          allowedDurations: [],
        });
        return;
      }

      const result = await fetchAdminSlots({
        serviceId,
        date,
        staffId: targets[0].id,
        durationMinutes,
        excludeAppointmentId,
      });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [
    serviceId,
    date,
    durationMinutes,
    staffId,
    staffOptions,
    isSup,
    excludeAppointmentId,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const wakeSlots = useMemo(() => {
    if (!data || data.kind !== "wake") return [] as CombinedWakeSlot[];
    return data.slots as CombinedWakeSlot[];
  }, [data]);

  const supSlots = useMemo(() => {
    if (!data || data.kind !== "sup") return [] as AdminSupSlot[];
    return data.slots;
  }, [data]);

  const showStaffLabels = !staffId && staffOptions.length > 1;

  if (!serviceId || !date) {
    return (
      <p className="text-sm text-slate-500">Выберите услугу и дату</p>
    );
  }

  if (!isSup && staffOptions.length === 0) {
    return (
      <p className="text-sm text-slate-500">Нет ресурсов для этой услуги</p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {loading && (
        <p className="text-sm text-slate-500">Загрузка свободного времени…</p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && !error && isSup && (
        <div
          className={cn(
            "grid gap-1.5",
            compact ? "grid-cols-4" : "grid-cols-4 sm:grid-cols-6",
          )}
        >
          {supSlots.map((slot) => {
            const selected = selectedStartAt === slot.startAt;
            return (
              <button
                key={slot.startAt}
                type="button"
                onClick={() => onPick({ startAt: slot.startAt })}
                className={cn(
                  "touch-manipulation rounded-lg border px-1 py-2 text-center text-xs font-medium",
                  selected
                    ? "border-lime-600 bg-lime-600 text-white"
                    : "border-slate-300 bg-white text-slate-800 active:bg-slate-50",
                )}
              >
                <span className="block tabular-nums">{formatAdminSlotTime(slot.startAt)}</span>
                <span className="block text-[10px] font-normal opacity-75">
                  {slot.availableBoards} дос.
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!loading && !error && !isSup && (
        <div
          className={cn(
            "grid max-h-[min(50vh,320px)] gap-1.5 overflow-y-auto overscroll-contain pr-0.5",
            compact ? "grid-cols-4" : "grid-cols-4 sm:grid-cols-6",
          )}
        >
          {wakeSlots.map((slot) => {
            const selected = selectedStartAt === slot.startAt;
            const label = slot.staffLabel ?? slot.staffName;
            return (
              <button
                key={`${slot.staffId}-${slot.startAt}`}
                type="button"
                onClick={() =>
                  onPick({
                    startAt: slot.startAt,
                    staffId: slot.staffId,
                    staffName: slot.staffName,
                  })
                }
                className={cn(
                  "touch-manipulation rounded-lg border px-1 py-2 text-center text-xs font-medium",
                  selected
                    ? "border-lime-600 bg-lime-600 text-white"
                    : "border-slate-300 bg-white text-slate-800 active:bg-slate-50",
                )}
              >
                <span className="block tabular-nums">{formatAdminSlotTime(slot.startAt)}</span>
                {(showStaffLabels || staffOptions.length > 1) && (
                  <span
                    className={cn(
                      "mt-0.5 block truncate text-[10px] font-normal",
                      selected ? "text-white/80" : "text-slate-500",
                    )}
                  >
                    {label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!loading && !error && isSup && supSlots.length === 0 && (
        <p className="text-sm text-slate-500">Нет свободного времени на эту дату</p>
      )}

      {!loading && !error && !isSup && wakeSlots.length === 0 && (
        <p className="text-sm text-slate-500">Нет свободного времени на эту дату</p>
      )}
    </div>
  );
}
