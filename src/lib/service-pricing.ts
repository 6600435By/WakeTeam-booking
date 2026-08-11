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

export type ServicePriceInput = {
  price: number;
  durationMinutes: number;
  priceRules?: ServicePriceRuleDto[];
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

/**
 * Package tariffs from admin (10/30/60):
 * - exact key in pricesByDuration → that price
 * - duration > 60 with a 60-min package → minutes × (price60 / 60)
 * - otherwise proportional from rule base / tariff interval
 */
export function rulePriceForDuration(
  rule: ServicePriceRuleDto,
  tariffDuration: number,
  bookingDuration: number,
): number {
  const byDuration = rule.pricesByDuration;
  const explicit = byDuration?.[bookingDuration];
  if (explicit != null && Number.isFinite(explicit)) return explicit;

  const package60 = byDuration?.[60];
  if (package60 != null && Number.isFinite(package60) && bookingDuration > 60) {
    return Math.round((package60 / 60) * bookingDuration * 100) / 100;
  }

  return priceForDuration(rule.price, tariffDuration, bookingDuration);
}

function findPriceRule(
  service: ServicePriceInput,
  startAt: Date,
  options?: { pricingWeekday?: number },
): ServicePriceRuleDto | null {
  if (!service.priceRules?.length) return null;
  const dateStr = formatDateKey(startAt);
  const timeStr = formatInTimeZone(startAt, TZ, "HH:mm");
  const wd = options?.pricingWeekday ?? weekdayMinsk(dateStr);
  const sorted = [...service.priceRules].sort(
    (a, b) =>
      a.timeFrom.localeCompare(b.timeFrom) ||
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  return (
    sorted.find((r) => {
      if (!parseWeekdays(r.weekdays).has(wd)) return false;
      if (timeStr < r.timeFrom) return false;
      if (timeStr >= r.timeTo) return false;
      return true;
    }) ?? null
  );
}

export function resolveServicePrice(
  service: ServicePriceInput,
  startAt: Date,
  durationMinutes: number,
  options?: { pricingWeekday?: number },
): number {
  const tariffDuration = service.durationMinutes;
  const rule = findPriceRule(service, startAt, options);
  if (rule) {
    return rulePriceForDuration(rule, tariffDuration, durationMinutes);
  }
  return priceForDuration(service.price, tariffDuration, durationMinutes);
}

/** Split total across N appointment rows without losing cents. */
export function distributeTotalPrice(total: number, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [Math.round(total * 100) / 100];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from(
    { length: count },
    (_, i) => (base + (i < remainder ? 1 : 0)) / 100,
  );
}

export function groupContiguousStarts(
  starts: Date[],
  cellMinutes: number,
): Date[][] {
  const sorted = [...starts].sort((a, b) => a.getTime() - b.getTime());
  if (sorted.length === 0) return [];
  const cellMs = cellMinutes * 60_000;
  const groups: Date[][] = [];
  let current: Date[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = current[current.length - 1];
    if (sorted[i].getTime() === prev.getTime() + cellMs) {
      current.push(sorted[i]);
    } else {
      groups.push(current);
      current = [sorted[i]];
    }
  }
  groups.push(current);
  return groups;
}

/**
 * Wake multi-cell pricing: contiguous blocks use package duration (30/60/…),
 * not N × 10-min rate. Returns total and per-cell prices aligned to input order.
 */
export function resolveWakeCellsPrice(
  service: ServicePriceInput,
  startAts: Date[],
  cellMinutes: number,
  options?: {
    pricingWeekday?: number;
    pricingWeekdayForStart?: (startAt: Date) => number;
  },
): { total: number; prices: number[] } {
  if (startAts.length === 0) return { total: 0, prices: [] };
  const priceByTs = new Map<number, number>();
  const groups = groupContiguousStarts(startAts, cellMinutes);

  for (const group of groups) {
    const durationMinutes = group.length * cellMinutes;
    const startAt = group[0];
    const weekdayOpts =
      options?.pricingWeekdayForStart != null
        ? { pricingWeekday: options.pricingWeekdayForStart(startAt) }
        : options?.pricingWeekday != null
          ? { pricingWeekday: options.pricingWeekday }
          : undefined;
    const blockTotal = resolveServicePrice(
      service,
      startAt,
      durationMinutes,
      weekdayOpts,
    );
    const parts = distributeTotalPrice(blockTotal, group.length);
    group.forEach((d, i) => priceByTs.set(d.getTime(), parts[i] ?? 0));
  }

  const prices = startAts.map((d) => priceByTs.get(d.getTime()) ?? 0);
  const total =
    Math.round(prices.reduce((sum, p) => sum + p, 0) * 100) / 100;
  return { total, prices };
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
  service: ServicePriceInput,
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
