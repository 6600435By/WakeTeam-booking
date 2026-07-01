"use client";

import { useEffect, useRef } from "react";
import { formatDateKey } from "@/lib/time";
import type { ActivityKind, SupSlot, WakeSlot, WidgetConfig, WidgetService } from "./widget-types";
import { isStaffPickActivity } from "./widget-types";

export const WAKE_CELL_MINUTES = 10;
export const SUP_SLOT_MINUTES = 60;
export const MAX_AUTO_DATE_SCAN_DAYS = 45;

export function todayStr() {
  return formatDateKey(new Date());
}

export function postHeight(height: number) {
  if (typeof window === "undefined") return;
  window.parent.postMessage(
    JSON.stringify({ height, type: "static", scroll: "no" }),
    "*",
  );
}

export function useEmbedHeight(active: boolean) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const el = rootRef.current;
    if (!el) return;

    function report() {
      const height = Math.ceil(el!.getBoundingClientRect().height);
      postHeight(height);
    }

    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  return rootRef;
}

export function formatTariffLine(
  rule: { weekdays: string; timeFrom: string; timeTo: string; price: number },
  baseDuration: number,
): string {
  const days =
    rule.weekdays === "6,7"
      ? "Сб–Вс"
      : rule.weekdays === "1,2,3,4,5"
        ? "Пн–Пт"
        : rule.weekdays;
  return `${days} ${rule.timeFrom}–${rule.timeTo} — ${rule.price} Br / ${baseDuration} мин`;
}

export function formatSlotTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Minsk",
  });
}

export function formatSessionStart(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Minsk",
  });
}

export function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function shiftDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return formatDateKey(d);
}

export function wakeHasFree(slots: WakeSlot[]) {
  return slots.some((s) => s.status === "free");
}

export function supHasFree(slots: SupSlot[]) {
  return slots.some((s) => s.availableBoards > 0);
}

export async function fetchWakeSlots(serviceId: string, staffId: string, date: string) {
  const q = new URLSearchParams({ serviceId, staffId, date });
  const r = await fetch(`/api/public/slots?${q}`);
  const d = await r.json();
  return (d.slots ?? []) as WakeSlot[];
}

export async function fetchSupSlots(serviceId: string, date: string) {
  const q = new URLSearchParams({ serviceId, date });
  const r = await fetch(`/api/public/slots?${q}`);
  const d = await r.json();
  return (d.slots ?? []) as SupSlot[];
}

export async function branchHasFreeSlots(
  config: WidgetConfig,
  targetBranchId: string,
  service: Pick<WidgetService, "id" | "kind" | "staff">,
  date: string,
): Promise<boolean> {
  if (service.kind === "sup") {
    const slots = await fetchSupSlots(service.id, date);
    return supHasFree(slots);
  }
  for (const st of service.staff) {
    const slots = await fetchWakeSlots(service.id, st.id, date);
    if (wakeHasFree(slots)) return true;
  }
  return false;
}

export function supVisibleIndexToStep(index: number): number {
  if (index <= 1) return index;
  return index === 2 ? 2 : 3;
}

export function supStepToVisibleIndex(step: number): number {
  if (step <= 1) return step;
  if (step === 2) return 2;
  return 3;
}

export const SLOT_SCROLL_HEIGHT_PX = 208;

export const slotGridScrollStyle: React.CSSProperties = {
  height: SLOT_SCROLL_HEIGHT_PX,
  maxHeight: SLOT_SCROLL_HEIGHT_PX,
  overflowY: "auto",
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  touchAction: "pan-y",
  position: "relative",
};

export const slotGridScrollClass = "widget-slot-grid-scroll";
export const slotGridClass = "widget-slot-grid";
