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
  serviceId?: string;
};

type StaffOption = { id: string; name: string };

export type AdminFreeSlotService = {
  id: string;
  kind: string;
  name: string;
  staffOptions: StaffOption[];
};

type Props = {
  date: string;
  /** Single-service mode (legacy). Ignored when `services` is provided. */
  serviceId?: string;
  serviceKind?: string;
  durationMinutes?: number;
  staffId?: string;
  staffOptions?: StaffOption[];
  /** Multi-service mode: load and merge free slots across services. */
  services?: AdminFreeSlotService[];
  selectedStartAt?: string;
  excludeAppointmentId?: string;
  onPick: (pick: AdminSlotPick) => void;
  className?: string;
  compact?: boolean;
};

type CombinedWakeSlot = AdminWakeSlot & {
  staffLabel?: string;
  serviceId?: string;
  serviceLabel?: string;
};

type CombinedSupSlot = AdminSupSlot & {
  serviceId?: string;
  serviceLabel?: string;
};

async function loadWakeSlotsForService(params: {
  serviceId: string;
  serviceName: string;
  date: string;
  durationMinutes?: number;
  staffId?: string;
  staffOptions: StaffOption[];
  excludeAppointmentId?: string;
}): Promise<CombinedWakeSlot[]> {
  const targets = params.staffId
    ? params.staffOptions.filter((st) => st.id === params.staffId)
    : params.staffOptions;

  if (targets.length === 0) return [];

  const results = await Promise.all(
    targets.map(async (st) => {
      const result = await fetchAdminSlots({
        serviceId: params.serviceId,
        date: params.date,
        staffId: st.id,
        durationMinutes: params.durationMinutes,
        excludeAppointmentId: params.excludeAppointmentId,
      });
      return result.kind === "wake"
        ? result.slots.map((slot) => ({
            ...slot,
            staffLabel: st.name,
            serviceId: params.serviceId,
            serviceLabel: params.serviceName,
          }))
        : [];
    }),
  );
  return results.flat();
}

export function AdminFreeSlotPicker({
  date,
  serviceId,
  serviceKind = "wake",
  durationMinutes,
  staffId,
  staffOptions = [],
  services,
  selectedStartAt,
  excludeAppointmentId,
  onPick,
  className,
  compact = false,
}: Props) {
  const serviceTargets = useMemo<AdminFreeSlotService[]>(() => {
    if (services && services.length > 0) return services;
    if (!serviceId) return [];
    return [
      {
        id: serviceId,
        kind: serviceKind,
        name: "",
        staffOptions,
      },
    ];
  }, [services, serviceId, serviceKind, staffOptions]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [wakeSlots, setWakeSlots] = useState<CombinedWakeSlot[]>([]);
  const [supSlots, setSupSlots] = useState<CombinedSupSlot[]>([]);

  const load = useCallback(async () => {
    if (!date || serviceTargets.length === 0) return;

    setLoading(true);
    setError("");
    try {
      const wakeParts: CombinedWakeSlot[] = [];
      const supParts: CombinedSupSlot[] = [];

      await Promise.all(
        serviceTargets.map(async (service) => {
          if (service.kind === "sup") {
            const result: AdminSlotsResponse = await fetchAdminSlots({
              serviceId: service.id,
              date,
              durationMinutes,
              excludeAppointmentId,
            });
            if (result.kind === "sup") {
              supParts.push(
                ...result.slots.map((slot) => ({
                  ...slot,
                  serviceId: service.id,
                  serviceLabel: service.name,
                })),
              );
            }
            return;
          }

          const slots = await loadWakeSlotsForService({
            serviceId: service.id,
            serviceName: service.name,
            date,
            durationMinutes,
            staffId: serviceTargets.length === 1 ? staffId : undefined,
            staffOptions: service.staffOptions,
            excludeAppointmentId,
          });
          wakeParts.push(...slots);
        }),
      );

      wakeParts.sort((a, b) => a.startAt.localeCompare(b.startAt));
      supParts.sort((a, b) => a.startAt.localeCompare(b.startAt));
      setWakeSlots(wakeParts);
      setSupSlots(supParts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setWakeSlots([]);
      setSupSlots([]);
    } finally {
      setLoading(false);
    }
  }, [
    date,
    durationMinutes,
    excludeAppointmentId,
    serviceTargets,
    staffId,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const multiService = serviceTargets.length > 1;
  const showStaffLabels =
    multiService ||
    (!staffId &&
      serviceTargets.some((service) => service.staffOptions.length > 1));

  if (!date || serviceTargets.length === 0) {
    return (
      <p className="text-sm text-slate-500">Выберите услугу и дату</p>
    );
  }

  const hasWakeTargets = serviceTargets.some(
    (service) => service.kind !== "sup" && service.staffOptions.length > 0,
  );
  const hasSupTargets = serviceTargets.some((service) => service.kind === "sup");

  if (!hasWakeTargets && !hasSupTargets) {
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

      {!loading && !error && supSlots.length > 0 && (
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
                key={`${slot.serviceId ?? "sup"}-${slot.startAt}`}
                type="button"
                onClick={() =>
                  onPick({
                    startAt: slot.startAt,
                    serviceId: slot.serviceId,
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
                <span className="block text-[10px] font-normal opacity-75">
                  {slot.availableBoards} дос.
                </span>
                {multiService && slot.serviceLabel ? (
                  <span
                    className={cn(
                      "mt-0.5 block truncate text-[10px] font-normal",
                      selected ? "text-white/80" : "text-slate-500",
                    )}
                  >
                    {slot.serviceLabel}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {!loading && !error && wakeSlots.length > 0 && (
        <div
          className={cn(
            "grid max-h-[min(50vh,320px)] gap-1.5 overflow-y-auto overscroll-contain pr-0.5",
            compact ? "grid-cols-4" : "grid-cols-4 sm:grid-cols-6",
          )}
        >
          {wakeSlots.map((slot) => {
            const selected = selectedStartAt === slot.startAt;
            const label = multiService
              ? [slot.serviceLabel, slot.staffLabel ?? slot.staffName]
                  .filter(Boolean)
                  .join(" · ")
              : (slot.staffLabel ?? slot.staffName);
            return (
              <button
                key={`${slot.serviceId ?? "wake"}-${slot.staffId}-${slot.startAt}`}
                type="button"
                onClick={() =>
                  onPick({
                    startAt: slot.startAt,
                    staffId: slot.staffId,
                    staffName: slot.staffName,
                    serviceId: slot.serviceId,
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
                {(showStaffLabels || multiService) && label ? (
                  <span
                    className={cn(
                      "mt-0.5 block truncate text-[10px] font-normal",
                      selected ? "text-white/80" : "text-slate-500",
                    )}
                  >
                    {label}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {!loading && !error && wakeSlots.length === 0 && supSlots.length === 0 && (
        <p className="text-sm text-slate-500">Нет свободного времени на эту дату</p>
      )}
    </div>
  );
}
