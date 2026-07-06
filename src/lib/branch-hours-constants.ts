import { weekdayMinsk } from "@/lib/time";

/** Код дня недели для праздничных тарифов в ServicePriceRule.weekdays */
export const HOLIDAY_WEEKDAY = 8;

export function pricingWeekdayForDate(
  dateKey: string,
  holidayDates: readonly string[],
): number {
  return holidayDates.includes(dateKey) ? HOLIDAY_WEEKDAY : weekdayMinsk(dateKey);
}
