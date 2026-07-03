"use client";

import {
  bookingDurationOptions,
  parseAllowedDurations,
  SERVICE_SLOT_DURATIONS,
} from "@/lib/service-durations";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

type Props = {
  durationMinutes: number;
  allowedDurations: string;
  onDurationMinutesChange: (minutes: number) => void;
  onAllowedDurationsChange: (allowed: string) => void;
  compact?: boolean;
};

export function ServiceDurationSettings({
  durationMinutes,
  allowedDurations,
  onDurationMinutesChange,
  onAllowedDurationsChange,
  compact = false,
}: Props) {
  const bookingOptions = bookingDurationOptions(durationMinutes);
  const selectedBookingDurations = parseAllowedDurations(allowedDurations);

  function setSlotDuration(minutes: number) {
    onDurationMinutesChange(minutes);
  }

  function toggleBookingDuration(minutes: number) {
    const current = parseAllowedDurations(allowedDurations);
    const next = current.includes(minutes)
      ? current.filter((d) => d !== minutes)
      : [...current, minutes].sort((a, b) => a - b);
    if (next.length === 0) return;
    onAllowedDurationsChange(next.join(","));
  }

  return (
    <div className={compact ? "space-y-3" : "mt-4 grid gap-3 sm:grid-cols-2"}>
      <div className="block">
        <span className="mb-1 block text-xs text-slate-500">
          Интервал тарифа, мин
        </span>
        <div className="flex flex-wrap gap-2">
          {SERVICE_SLOT_DURATIONS.map((minutes) => {
            const active = durationMinutes === minutes;
            return (
              <button
                key={minutes}
                type="button"
                onClick={() => setSlotDuration(minutes)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-lime-600 bg-lime-50 text-lime-800"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {minutes}
              </button>
            );
          })}
        </div>
        <span className="mt-1 block text-[11px] text-slate-400">
          Минимальный шаг слота в журнале и виджете
        </span>
      </div>

      {bookingOptions.length > 1 && (
        <div className={compact ? "" : "sm:col-span-2"}>
          <span className="mb-1 block text-xs text-slate-500">
            Длительности записи, мин
          </span>
          <div className="flex flex-wrap gap-2">
            {bookingOptions.map((minutes) => {
              const active = selectedBookingDurations.includes(minutes);
              return (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => toggleBookingDuration(minutes)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "border-lime-600 bg-lime-50 text-lime-800"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {minutes}
                </button>
              );
            })}
          </div>
          <span className="mt-1 block text-[11px] text-slate-400">
            Доступные варианты длительности при записи
          </span>
        </div>
      )}
    </div>
  );
}

export { inputClass as serviceDurationInputClass };
