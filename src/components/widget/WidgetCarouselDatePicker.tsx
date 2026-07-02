"use client";

import { useMemo } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { parseTimeOnDate, TZ } from "@/lib/time";
import {
  WidgetCalendarLink,
  WidgetDateNavButton,
} from "@/components/widget/widget-primitives";
import { shiftDateStr, todayStr } from "./widget-booking-utils";

const WEEKDAY_ABBR = ["", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"] as const;
const CAROUSEL_RADIUS = 2;

function weekdayAbbr(dateStr: string) {
  const isoDow = Number(
    formatInTimeZone(parseTimeOnDate(dateStr, "12:00"), TZ, "i"),
  );
  return WEEKDAY_ABBR[isoDow] ?? "";
}

function buildCarouselDates(selected: string, today: string): string[] {
  const offsets = Array.from(
    { length: CAROUSEL_RADIUS * 2 + 1 },
    (_, i) => i - CAROUSEL_RADIUS,
  );
  const dates = offsets
    .map((o) => shiftDateStr(selected, o))
    .filter((d) => d >= today);
  let next = shiftDateStr(selected, CAROUSEL_RADIUS + 1);
  while (dates.length < CAROUSEL_RADIUS * 2 + 1) {
    if (!dates.includes(next)) dates.push(next);
    next = shiftDateStr(next, 1);
  }
  return dates.slice(0, CAROUSEL_RADIUS * 2 + 1);
}

export function WidgetCarouselDatePicker({
  date,
  onChange,
}: {
  date: string;
  onChange: (d: string) => void;
}) {
  const today = todayStr();
  const carouselDates = useMemo(
    () => buildCarouselDates(date, today),
    [date, today],
  );
  const monthLabel = formatInTimeZone(
    parseTimeOnDate(date, "12:00"),
    TZ,
    "LLLL",
    { locale: ru },
  );
  const monthCapitalized =
    monthLabel.charAt(0).toLocaleUpperCase("ru") + monthLabel.slice(1);

  const openCalendar = () => {
    const input = document.createElement("input");
    input.type = "date";
    input.value = date;
    input.min = today;
    input.style.cssText =
      "position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(input);

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener("change", () => {
      if (input.value) onChange(input.value);
      cleanup();
    });
    input.addEventListener("blur", cleanup, { once: true });

    if (typeof input.showPicker === "function") {
      void Promise.resolve(input.showPicker()).catch(cleanup);
    } else {
      input.click();
    }
  };

  return (
    <div className="mt-2">
      <p className="text-center text-sm font-medium tracking-tight text-slate-800">
        {monthCapitalized}
      </p>
      <WidgetCalendarLink onClick={openCalendar} />

      <div className="mt-1.5 flex items-center gap-0.5">
        <WidgetDateNavButton
          direction="prev"
          label="Предыдущий день"
          disabled={date <= today}
          onClick={() => date > today && onChange(shiftDateStr(date, -1))}
        />

        <div className="flex min-w-0 flex-1 items-stretch justify-between gap-1 px-0.5">
          {carouselDates.map((d) => {
            const selected = d === date;
            const dayNum = formatInTimeZone(
              parseTimeOnDate(d, "12:00"),
              TZ,
              "d",
            );
            const weekday = weekdayAbbr(d);

            return (
              <button
                key={d}
                type="button"
                onClick={() => onChange(d)}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center rounded-lg py-1.5 transition-all duration-200",
                  selected
                    ? "bg-[var(--widget-primary)]/12 text-slate-900 shadow-sm ring-1 ring-[var(--widget-primary)]/20"
                    : "text-slate-400 hover:bg-slate-50 hover:text-slate-600",
                )}
              >
                <span
                  className={cn(
                    "font-semibold tabular-nums leading-none",
                    selected ? "text-base sm:text-lg" : "text-sm",
                  )}
                >
                  {dayNum}
                </span>
                <span
                  className={cn(
                    "mt-0.5 leading-none font-medium",
                    selected ? "text-[10px] text-slate-700" : "text-[9px]",
                  )}
                >
                  {weekday}
                </span>
              </button>
            );
          })}
        </div>

        <WidgetDateNavButton
          direction="next"
          label="Следующий день"
          onClick={() => onChange(shiftDateStr(date, 1))}
        />
      </div>
    </div>
  );
}
