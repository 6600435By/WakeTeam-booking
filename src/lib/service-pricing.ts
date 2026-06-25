import { formatInTimeZone } from "date-fns-tz";
import { formatDateKey, TZ, weekdayMinsk } from "@/lib/time";

export type ServicePriceRuleDto = {
  weekdays: string;
  timeFrom: string;
  timeTo: string;
  price: number;
  sortOrder?: number;
};

function parseWeekdays(s: string): Set<number> {
  return new Set(
    s
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !Number.isNaN(n)),
  );
}

export function priceForDuration(
  basePrice: number,
  baseDuration: number,
  duration: number,
): number {
  return Math.round((basePrice / baseDuration) * duration * 100) / 100;
}

export function resolveServicePrice(
  service: {
    price: number;
    durationMinutes: number;
    priceRules?: ServicePriceRuleDto[];
  },
  startAt: Date,
  durationMinutes: number,
): number {
  const dateStr = formatDateKey(startAt);
  const timeStr = formatInTimeZone(startAt, TZ, "HH:mm");
  const wd = weekdayMinsk(dateStr);

  if (service.priceRules?.length) {
    const sorted = [...service.priceRules].sort(
      (a, b) =>
        a.timeFrom.localeCompare(b.timeFrom) ||
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
    const rule = sorted.find((r) => {
      if (!parseWeekdays(r.weekdays).has(wd)) return false;
      if (timeStr < r.timeFrom) return false;
      if (timeStr >= r.timeTo) return false;
      return true;
    });
    const base = rule?.price ?? service.price;
    return priceForDuration(base, service.durationMinutes, durationMinutes);
  }

  return priceForDuration(service.price, service.durationMinutes, durationMinutes);
}

export function minPriceFromRules(service: {
  price: number;
  priceRules?: ServicePriceRuleDto[];
}): number {
  if (!service.priceRules?.length) return service.price;
  return Math.min(service.price, ...service.priceRules.map((r) => r.price));
}
