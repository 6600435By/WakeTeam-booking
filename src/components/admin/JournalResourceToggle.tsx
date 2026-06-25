"use client";

import {
  RESOURCE_KIND_OPTIONS,
  type JournalResourceKind,
} from "@/lib/journal-resources";

type Props = {
  value: JournalResourceKind;
  onChange: (kind: JournalResourceKind) => void;
  className?: string;
};

export function JournalResourceToggle({ value, onChange, className = "" }: Props) {
  return (
    <div
      className={`inline-flex rounded-lg border border-slate-300 bg-slate-50 p-0.5 ${className}`}
      role="group"
      aria-label="Тип ресурсов"
    >
      {RESOURCE_KIND_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`min-h-[32px] rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              active
                ? "bg-white text-lime-800 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
