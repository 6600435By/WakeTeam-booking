"use client";

import type { JournalResourceFilter } from "@/lib/journal-resources";
import { useAdminViewport } from "./AdminViewportContext";
import { cn } from "@/lib/utils";

type Option = {
  value: JournalResourceFilter;
  label: string;
};

type Props = {
  value: JournalResourceFilter;
  onChange: (kind: JournalResourceFilter) => void;
  options: Option[];
  className?: string;
  compact?: boolean;
  dense?: boolean;
};

export function JournalResourceToggle({
  value,
  onChange,
  options,
  className = "",
  compact = false,
  dense = false,
}: Props) {
  const isMobile = useAdminViewport() === "mobile";

  return (
    <div
      className={cn(
        "inline-flex max-w-full flex-wrap rounded-md border border-slate-300 bg-slate-50 p-0.5",
        compact && "w-full",
        dense && "p-px",
        className,
      )}
      role="group"
      aria-label="Тип ресурсов"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "touch-manipulation rounded font-medium transition-colors active:scale-[0.98]",
              dense
                ? "h-6 px-2 text-[11px]"
                : compact
                  ? "min-h-[44px] flex-1 px-2 py-2 text-xs"
                  : "min-h-[32px] px-3 py-1 text-sm",
              isMobile && !compact && !dense && "min-h-[44px] px-2.5 py-2 text-xs",
              active
                ? "bg-white text-lime-800 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
