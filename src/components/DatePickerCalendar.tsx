"use client";

import { useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildCalendarMonthDays,
  CALENDAR_WEEKDAY_LABELS,
  isDateKeyInRange,
  resolveCalendarAnchorDateKey,
  shiftMonthDateKey,
} from "@/lib/calendar-ui";
import { cn } from "@/lib/utils";
import { formatDateKey, parseTimeOnDate, TZ } from "@/lib/time";

type Props = {
  value: string;
  onChange: (dateKey: string) => void;
  min?: string;
  max?: string;
  variant?: "admin" | "widget";
  viewDate?: string;
  className?: string;
};

export function DatePickerCalendar({
  value,
  onChange,
  min,
  max,
  variant = "admin",
  viewDate,
  className,
}: Props) {
  const today = formatDateKey(new Date());
  const anchorDateKey = resolveCalendarAnchorDateKey(value, viewDate);
  const [monthKey, setMonthKey] = useState(anchorDateKey);

  useEffect(() => {
    setMonthKey(resolveCalendarAnchorDateKey(value, viewDate));
  }, [viewDate, value]);

  const monthLabel = formatInTimeZone(
    parseTimeOnDate(monthKey, "12:00"),
    TZ,
    "LLLL yyyy",
    { locale: ru },
  );
  const monthTitle =
    monthLabel.charAt(0).toLocaleUpperCase("ru") + monthLabel.slice(1);
  const days = buildCalendarMonthDays(monthKey);
  const isWidget = variant === "widget";

  return (
    <div
      className={cn(
        "w-[min(100vw-2rem,17.5rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg ring-1 ring-black/[0.04]",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Предыдущий месяц"
          className="flex size-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          onClick={() => setMonthKey((k) => shiftMonthDateKey(k, -1))}
        >
          <ChevronLeft className="size-4" strokeWidth={2.25} />
        </button>
        <p className="text-sm font-semibold capitalize text-slate-900">{monthTitle}</p>
        <button
          type="button"
          aria-label="Следующий месяц"
          className="flex size-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          onClick={() => setMonthKey((k) => shiftMonthDateKey(k, 1))}
        >
          <ChevronRight className="size-4" strokeWidth={2.25} />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {CALENDAR_WEEKDAY_LABELS.map((label) => (
          <span
            key={label}
            className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-slate-400"
          >
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map(({ dateKey, inMonth }) => {
          const selected = dateKey === value;
          const isToday = dateKey === today;
          const enabled = inMonth && isDateKeyInRange(dateKey, min, max);
          const dayNum = formatInTimeZone(
            parseTimeOnDate(dateKey, "12:00"),
            TZ,
            "d",
          );

          return (
            <button
              key={dateKey}
              type="button"
              disabled={!enabled}
              onClick={() => enabled && onChange(dateKey)}
              className={cn(
                "flex size-8 items-center justify-center rounded-lg text-sm tabular-nums transition-colors",
                !inMonth && "text-slate-300",
                inMonth && !enabled && "text-slate-300",
                inMonth &&
                  enabled &&
                  !selected &&
                  "text-slate-700 hover:bg-slate-100",
                selected &&
                  (isWidget
                    ? "bg-[var(--widget-primary)] font-semibold text-white shadow-sm"
                    : "bg-slate-900 font-semibold text-white shadow-sm"),
                isToday &&
                  !selected &&
                  enabled &&
                  "ring-1 ring-inset ring-slate-300",
              )}
            >
              {dayNum}
            </button>
          );
        })}
      </div>
    </div>
  );
}
