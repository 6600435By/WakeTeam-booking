import {
  APPOINTMENT_STATUS_OPTIONS,
  statusBadgeClass,
  statusBlockClass,
  statusDotClass,
  statusLabel,
} from "@/lib/appointment-status";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(status)}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(status)}`} />
      {statusLabel(status)}
    </span>
  );
}

export function StatusLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "flex max-w-[50%] flex-wrap justify-end gap-x-2 gap-y-1 text-[10px] text-slate-500"
          : "mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-600"
      }
    >
      {APPOINTMENT_STATUS_OPTIONS.map((s) => (
        <span
          key={s.value}
          className={
            compact
              ? "inline-flex items-center gap-1 whitespace-nowrap"
              : "mr-2 inline-flex items-center gap-1.5 whitespace-nowrap"
          }
        >
          <span
            className={`inline-block shrink-0 rounded-full ${compact ? "h-1.5 w-1.5" : "h-2 w-2"} ${s.dot}`}
          />
          {compact ? s.label.slice(0, 4) : s.label}
        </span>
      ))}
    </div>
  );
}

export { statusBlockClass, statusDotClass, statusLabel };
