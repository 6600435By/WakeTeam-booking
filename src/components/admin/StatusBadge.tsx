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

export function StatusLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
      {APPOINTMENT_STATUS_OPTIONS.map((s) => (
        <span
          key={s.value}
          className="mr-2 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${s.dot}`}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

export { statusBlockClass, statusDotClass, statusLabel };
