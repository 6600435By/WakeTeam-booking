"use client";

import {
  type JournalGridScale,
  stepJournalGridScale,
  JOURNAL_GRID_SCALES,
} from "@/lib/journal-grid-scale";

type Props = {
  value: JournalGridScale;
  onChange: (scale: JournalGridScale) => void;
  className?: string;
};

export function JournalGridZoomButtons({ value, onChange, className = "" }: Props) {
  const index = JOURNAL_GRID_SCALES.indexOf(value);

  return (
    <div
      className={`inline-flex overflow-hidden rounded border border-slate-300 bg-white shadow-sm ${className}`}
      role="group"
      aria-label="Масштаб сетки"
    >
      <button
        type="button"
        onClick={() => onChange(stepJournalGridScale(value, -1))}
        disabled={index <= 0}
        className="flex h-6 w-6 items-center justify-center text-sm leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        aria-label="Уменьшить"
      >
        −
      </button>
      <button
        type="button"
        onClick={() => onChange(stepJournalGridScale(value, 1))}
        disabled={index >= JOURNAL_GRID_SCALES.length - 1}
        className="flex h-6 w-6 items-center justify-center border-l border-slate-300 text-sm leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        aria-label="Увеличить"
      >
        +
      </button>
    </div>
  );
}

export {
  loadJournalGridScale,
  saveJournalGridScale,
} from "@/lib/journal-grid-scale";
