import { formatInTimeZone } from "date-fns-tz";
import { parseAllowedDurations } from "@/lib/service-durations";
import { formatDateKey, TZ, weekdayMinsk } from "@/lib/time";

export type ServicePriceRuleDto = {
  weekdays: string;
  timeFrom: string;
  timeTo: string;
  price: number;
  pricesByDuration?: Record<number, number>;
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

export function parsePricesByDuration(
  json: string | null | undefined,
): Record<number, number> | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as Record<string, number>;
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = parseInt(k, 10);
      if (!Number.isNaN(n) && v >= 0) out[n] = v;
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

export function priceForDuration(
  basePrice: number,
  baseDuration: number,
  duration: number,
): number {
  return Math.round((basePrice / baseDuration) * duration * 100) / 100;
}

function rulePriceForDuration(
  rule: ServicePriceRuleDto,
  tariffDuration: number,
  bookingDuration: number,
): number {
  const explicit = rule.pricesByDuration?.[bookingDuration];
  if (explicit != null && Number.isFinite(explicit)) return explicit;
  return priceForDuration(rule.price, tariffDuration, bookingDuration);
}

export function resolveServicePrice(
  service: {
    price: number;
    durationMinutes: number;
    priceRules?: ServicePriceRuleDto[];
  },
  startAt: Date,
  durationMinutes: number,
  options?: { pricingWeekday?: number },
): number {
  const dateStr = formatDateKey(startAt);
  const timeStr = formatInTimeZone(startAt, TZ, "HH:mm");
  const wd = options?.pricingWeekday ?? weekdayMinsk(dateStr);
  const tariffDuration = service.durationMinutes;

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
    if (rule) {
      return rulePriceForDuration(rule, tariffDuration, durationMinutes);
    }
  }

  return priceForDuration(service.price, tariffDuration, durationMinutes);
}

export function minPriceFromRules(service: {
  price: number;
  durationMinutes?: number;
  allowedDurations?: string;
  priceRules?: ServicePriceRuleDto[];
}): number {
  if (!service.priceRules?.length) return service.price;
  const tariffDuration = service.durationMinutes ?? 60;
  const durations = service.allowedDurations
    ? parseAllowedDurations(service.allowedDurations)
    : [tariffDuration];
  const bookingDurations = durations.length > 0 ? durations : [tariffDuration];

  const prices: number[] = [];
  for (const rule of service.priceRules) {
    for (const d of bookingDurations) {
      prices.push(rulePriceForDuration(rule, tariffDuration, d));
    }
  }
  return Math.min(...prices);
}

/** Цена записи: по тарифу абонемента (Br/мин) или по тарифу услуги. */
export function resolveAppointmentPrice(
  service: {
    price: number;
    durationMinutes: number;
    priceRules?: ServicePriceRuleDto[];
  },
  startAt: Date,
  durationMinutes: number,
  membershipPricePerMinute?: number | null,
  options?: { pricingWeekday?: number },
): number {
  if (membershipPricePerMinute != null && membershipPricePerMinute > 0) {
    return Math.round(membershipPricePerMinute * durationMinutes * 100) / 100;
  }
  return resolveServicePrice(service, startAt, durationMinutes, options);
}
