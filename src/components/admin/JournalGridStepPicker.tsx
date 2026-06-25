"use client";

import {
  JOURNAL_GRID_STEPS,
  type JournalGridStep,
} from "@/lib/calendar-grid";

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
};

export function JournalGridStepPicker({ value, onChange, className = "" }: Props) {
  return (
    <div
      className={`inline-flex items-center gap-2 ${className}`}
      role="group"
      aria-label="Шаг сетки журнала"
    >
      <span className="text-sm text-slate-600">Шаг:</span>
      <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
        {JOURNAL_GRID_STEPS.map((step) => {
          const active = value === step;
          return (
            <button
              key={step}
              type="button"
              onClick={() => onChange(step)}
              className={`min-h-[36px] rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-lime-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
              aria-pressed={active}
            >
              {step} мин
            </button>
          );
        })}
      </div>
    </div>
  );
}
