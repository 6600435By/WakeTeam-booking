"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { DatePickerCalendar } from "@/components/DatePickerCalendar";
import { cn } from "@/lib/utils";
import { formatDateMinsk } from "@/lib/time";

const defaultInputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

type Props = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  min?: string;
  max?: string;
  id?: string;
  disabled?: boolean;
  labelClassName?: string;
};

export function DatePickerField({
  label,
  value,
  onChange,
  className,
  min,
  max,
  id: idProp,
  disabled,
  labelClassName,
}: Props) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {label ? (
        <label htmlFor={id} className={cn("mb-1 block text-xs text-slate-500", labelClassName)}>
          {label}
        </label>
      ) : null}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "flex w-full items-center justify-between gap-2 text-left",
          className ?? defaultInputClass,
          disabled && "cursor-not-allowed opacity-50",
        )}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className="tabular-nums">{formatDateMinsk(value) || value}</span>
        <CalendarDays className="size-4 shrink-0 text-slate-400" strokeWidth={2} />
      </button>

      {open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Закрыть календарь"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-1">
            <DatePickerCalendar
              value={value}
              min={min}
              max={max}
              variant="admin"
              onChange={(next) => {
                onChange(next);
                setOpen(false);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
