"use client";

import {
  JOURNAL_GRID_STEPS,
  type JournalGridStep,
} from "@/lib/calendar-grid";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "journal-grid-step";

export function loadJournalGridStep(): JournalGridStep {
  if (typeof window === "undefined") return 15;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "5" || raw === "10" || raw === "15") {
    return Number(raw) as JournalGridStep;
  }
  return 15;
}

export function saveJournalGridStep(step: JournalGridStep) {
  localStorage.setItem(STORAGE_KEY, String(step));
}

type Props = {
  value: JournalGridStep;
  onChange: (step: JournalGridStep) => void;
  className?: string;
  compact?: boolean;
};

export function JournalGridStepPicker({
  value,
  onChange,
  className = "",
  compact = false,
}: Props) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 ${className}`}
      role="group"
      aria-label="Шаг сетки журнала"
    >
      <span className={compact ? "text-[11px] text-slate-500" : "text-sm text-slate-600"}>
        Шаг
      </span>
      <div
        className={cn(
          "inline-flex rounded-md border border-slate-300 bg-white p-0.5",
          compact && "p-px",
        )}
      >
        {JOURNAL_GRID_STEPS.map((step) => {
          const active = value === step;
          return (
            <button
              key={step}
              type="button"
              onClick={() => onChange(step)}
              className={cn(
                "rounded font-medium transition-colors",
                compact
                  ? "h-6 px-2 text-[11px]"
                  : "min-h-[36px] rounded-md px-3 py-1.5 text-sm",
                active
                  ? "bg-lime-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50",
              )}
              aria-pressed={active}
            >
              {step}
            </button>
          );
        })}
      </div>
    </div>
  );
}
