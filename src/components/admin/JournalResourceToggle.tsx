"use client";

import {
  RESOURCE_KIND_OPTIONS,
  type JournalResourceKind,
} from "@/lib/journal-resources";
import { useAdminViewport } from "./AdminViewportContext";
import { cn } from "@/lib/utils";

type Props = {
  value: JournalResourceKind;
  onChange: (kind: JournalResourceKind) => void;
  className?: string;
  compact?: boolean;
};

export function JournalResourceToggle({
  value,
  onChange,
  className = "",
  compact = false,
}: Props) {
  const isMobile = useAdminViewport() === "mobile";

  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-slate-300 bg-slate-50 p-0.5",
        compact && "w-full",
        className,
      )}
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
            className={cn(
              "touch-manipulation rounded-md font-medium transition-colors active:scale-[0.98]",
              compact ? "min-h-[44px] flex-1 px-2 py-2 text-xs" : "min-h-[32px] px-3 py-1 text-sm",
              isMobile && !compact && "min-h-[44px] px-2.5 py-2 text-xs",
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
