import { parseAllowedDurations } from "@/lib/service-durations";
import {
  parsePricesByDuration,
  priceForDuration,
  type ServicePriceRuleDto,
} from "@/lib/service-pricing";

export type PriceRuleRow = {
  id: string;
  weekdays: string;
  timeFrom: string;
  timeTo: string;
  price: number;
  pricesByDuration?: Record<number, number>;
  sortOrder: number;
};

export function hydratePriceRules(
  rules:
    | Array<{
        id: string;
        weekdays: string;
        timeFrom: string;
        timeTo: string;
        price: number;
        sortOrder: number;
        pricesByDuration?: string | Record<number, number> | null;
      }>
    | undefined,
): PriceRuleRow[] {
  if (!rules) return [];
  return rules.map((r) => {
    if (typeof r.pricesByDuration === "object" && r.pricesByDuration !== null) {
      return {
        id: r.id,
        weekdays: r.weekdays,
        timeFrom: r.timeFrom,
        timeTo: r.timeTo,
        price: r.price,
        sortOrder: r.sortOrder,
        pricesByDuration: r.pricesByDuration,
      };
    }
    return mapPriceRuleFromDb({
      id: r.id,
      weekdays: r.weekdays,
      timeFrom: r.timeFrom,
      timeTo: r.timeTo,
      price: r.price,
      sortOrder: r.sortOrder,
      pricesByDuration:
        typeof r.pricesByDuration === "string" ? r.pricesByDuration : null,
    });
  });
}

export function mapPriceRuleFromDb(rule: {
  id: string;
  weekdays: string;
  timeFrom: string;
  timeTo: string;
  price: number;
  sortOrder: number;
  pricesByDuration?: string | null;
}): PriceRuleRow {
  return {
    id: rule.id,
    weekdays: rule.weekdays,
    timeFrom: rule.timeFrom,
    timeTo: rule.timeTo,
    price: rule.price,
    sortOrder: rule.sortOrder,
    pricesByDuration: parsePricesByDuration(rule.pricesByDuration),
  };
}

export function mapPriceRuleToApi(rule: PriceRuleRow, tariffDuration: number) {
  const pricesByDuration = rule.pricesByDuration;
  const serialized =
    pricesByDuration && Object.keys(pricesByDuration).length > 0
      ? JSON.stringify(
          Object.fromEntries(
            Object.entries(pricesByDuration)
              .filter(([, v]) => v >= 0)
              .sort(([a], [b]) => Number(a) - Number(b)),
          ),
        )
      : null;

  return {
    weekdays: rule.weekdays,
    timeFrom: rule.timeFrom,
    timeTo: rule.timeTo,
    price: pricesByDuration?.[tariffDuration] ?? rule.price,
    pricesByDuration: serialized,
    sortOrder: rule.sortOrder,
  };
}

export function defaultPricesByDuration(
  basePrice: number,
  tariffDuration: number,
  bookingDurations: number[],
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const d of bookingDurations) {
    out[d] = priceForDuration(basePrice, tariffDuration, d);
  }
  return out;
}

export function priceRuleDtoFromRow(
  rule: PriceRuleRow,
  tariffDuration: number,
): ServicePriceRuleDto {
  return {
    weekdays: rule.weekdays,
    timeFrom: rule.timeFrom,
    timeTo: rule.timeTo,
    price: rule.pricesByDuration?.[tariffDuration] ?? rule.price,
    pricesByDuration: rule.pricesByDuration,
    sortOrder: rule.sortOrder,
  };
}

export function minPriceFromRuleRows(
  basePrice: number,
  tariffDuration: number,
  allowedDurations: string,
  priceRules: PriceRuleRow[],
): number {
  const durations = parseAllowedDurations(allowedDurations);
  const bookingDurations = durations.length > 0 ? durations : [tariffDuration];
  if (!priceRules.length) return basePrice;

  const prices: number[] = [];
  for (const rule of priceRules) {
    const dto = priceRuleDtoFromRow(rule, tariffDuration);
    for (const d of bookingDurations) {
      prices.push(
        dto.pricesByDuration?.[d] ??
          priceForDuration(dto.price, tariffDuration, d),
      );
    }
  }
  return Math.min(...prices);
}
