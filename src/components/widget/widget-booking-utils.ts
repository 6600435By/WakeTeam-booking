"use client";

import { useEffect, useRef } from "react";
import { formatDateKey } from "@/lib/time";
import { priceForDuration } from "@/lib/service-pricing";
import { parseAllowedDurations } from "@/lib/service-durations";
import { parseWeekdays } from "@/lib/slots/slot-helpers";
import type { ActivityKind, SupSlot, WakeSlot, WidgetConfig, WidgetService } from "./widget-types";
import { isStaffPickActivity } from "./widget-types";

export const WAKE_CELL_MINUTES = 10;
export const MAX_AUTO_DATE_SCAN_DAYS = 45;

export function serviceBookingDurations(service: {
  allowedDurations: string;
  durationMinutes: number;
}): number[] {
  const parsed = parseAllowedDurations(service.allowedDurations);
  return parsed.length > 0 ? parsed : [service.durationMinutes];
}

export function shouldShowWidgetTariffs(service: {
  allowedDurations: string;
  durationMinutes: number;
  priceRules: { length: number };
}): boolean {
  return (
    serviceBookingDurations(service).length > 1 || service.priceRules.length > 0
  );
}

export function widgetTariffRulesForService(service: {
  price: number;
  durationMinutes: number;
  allowedDurations: string;
  priceRules: Array<{
    weekdays: string;
    timeFrom: string;
    timeTo: string;
    price: number;
    pricesByDuration?: Record<number, number>;
  }>;
  bookableFrom?: string | null;
  bookableTo?: string | null;
}) {
  if (service.priceRules.length > 0) return service.priceRules;
  const durations = serviceBookingDurations(service);
  if (durations.length <= 1) return [];
  const pricesByDuration: Record<number, number> = {};
  for (const d of durations) {
    pricesByDuration[d] = priceForDuration(
      service.price,
      service.durationMinutes,
      d,
    );
  }
  return [
    {
      weekdays: "1,2,3,4,5,6,7",
      timeFrom: service.bookableFrom ?? "09:00",
      timeTo: service.bookableTo ?? "21:00",
      price: service.price,
      pricesByDuration,
    },
  ];
}

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

export function useEmbedHeight(active: boolean, ...layoutDeps: unknown[]) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const el = rootRef.current;
    if (!el) return;

    /**
     * Natural content height of a container that may be stretched by
     * flex-1 / 100dvh: sum of children heights + own vertical padding.
     * Using scrollHeight here would echo the stretched layout back to the
     * iframe and inflate it to the max cap with dead space at the bottom.
     */
    function contentHeight(box: HTMLElement): number {
      const styles = window.getComputedStyle(box);
      const children = Array.from(box.children) as HTMLElement[];
      const inner = children.reduce(
        (sum, child) => sum + child.getBoundingClientRect().height,
        0,
      );
      return (
        inner +
        (parseFloat(styles.paddingTop) || 0) +
        (parseFloat(styles.paddingBottom) || 0)
      );
    }

    function measure(): number {
      const root = el!;
      const chrome = root.querySelector(".widget-shell-chrome") as HTMLElement | null;
      const scroll = root.querySelector(".widget-shell-scroll") as HTMLElement | null;
      const footer = root.querySelector(".widget-shell-footer") as HTMLElement | null;

      // The slot grid inside `scroll` is hard-capped by CSS, so the content
      // height stays modest. The footer already contains the time-step CTA.
      if (chrome || scroll || footer) {
        const natural =
          (chrome?.offsetHeight ?? 0) +
          (scroll ? contentHeight(scroll) : 0) +
          (footer?.offsetHeight ?? 0);
        return Math.ceil(Math.max(natural, 560));
      }
      return Math.ceil(Math.max(contentHeight(root), 560));
    }

    function report() {
      postHeight(measure());
    }

    report();
    const ro = new ResizeObserver(() => {
      report();
      requestAnimationFrame(report);
    });
    ro.observe(el);
    for (const selector of [
      ".widget-shell-scroll",
      ".widget-shell-footer",
      ".widget-time-cta",
    ]) {
      const section = el.querySelector(selector);
      if (section) ro.observe(section);
    }
    window.addEventListener("load", report);
    return () => {
      ro.disconnect();
      window.removeEventListener("load", report);
    };
    // layoutDeps: re-bind when step / selection changes (CTA mount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...layoutDeps]);

  return rootRef;
}

/** Человекочитаемые дни для строки тарифа; null — префикс не нужен (все дни). */
export function formatTariffWeekdaysLabel(weekdays: string): string | null {
  const set = parseWeekdays(weekdays);
  if (set.size === 0 || set.size === 7) return null;
  if ([1, 2, 3, 4, 5].every((d) => set.has(d)) && set.size === 5) return "Пн–Пт";
  if (set.has(6) && set.has(7) && set.size === 2) return "Сб–Вс";
  return null;
}

export function formatTariffLine(
  rule: {
    weekdays: string;
    timeFrom: string;
    timeTo: string;
    price: number;
    pricesByDuration?: Record<number, number>;
  },
  baseDuration: number,
  bookingDurations?: number[],
): string {
  const days = formatTariffWeekdaysLabel(rule.weekdays);
  const durations =
    bookingDurations && bookingDurations.length > 0
      ? bookingDurations
      : [baseDuration];
  const priceParts = durations
    .map((d) => {
      const amount =
        rule.pricesByDuration?.[d] ??
        priceForDuration(rule.price, baseDuration, d);
      return `${d} мин — ${amount} Br`;
    })
    .join(", ");
  const timePrice = `${rule.timeFrom}–${rule.timeTo}: ${priceParts}`;
  return days ? `${days} ${timePrice}` : timePrice;
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

export async function fetchSupSlots(
  serviceId: string,
  date: string,
  durationMinutes?: number,
) {
  const q = new URLSearchParams({ serviceId, date });
  if (durationMinutes != null) {
    q.set("durationMinutes", String(durationMinutes));
  }
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

/** Height is controlled by CSS clamp(dvh) in globals — keep overflow only here. */
export const slotGridScrollStyle: React.CSSProperties = {
  overflowY: "auto",
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  touchAction: "pan-y",
  position: "relative",
};

export const slotGridScrollClass = "widget-slot-grid-scroll";
export const slotGridClass = "widget-slot-grid";
