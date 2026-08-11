"use client";

import { useMemo, useState, memo } from "react";
import { defaultPricesByDuration, type PriceRuleRow } from "@/lib/price-rules";

export type { PriceRuleRow };

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс", "Празд."];

const PRICE_DRAFT_RE = /^\d*[.,]?\d*$/;

function priceDraftKey(ruleId: string, minutes: number) {
  return `${ruleId}:${minutes}`;
}

function parsePriceInput(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (normalized === "" || normalized === ".") return null;
  const n = parseFloat(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseWeekdays(s: string): Set<number> {
  return new Set(
    s
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !Number.isNaN(n)),
  );
}

function formatWeekdays(set: Set<number>): string {
  return [...set].sort((a, b) => a - b).join(",");
}

export function WeekdayPicker({
  value,
  onChange,
  compact = false,
  includeHoliday = true,
}: {
  value: string;
  onChange: (weekdays: string) => void;
  compact?: boolean;
  includeHoliday?: boolean;
}) {
  const selected = useMemo(() => parseWeekdays(value), [value]);
  const days = includeHoliday
    ? WEEKDAY_LABELS.map((label, i) => ({ day: i + 1, label }))
    : WEEKDAY_LABELS.slice(0, 7).map((label, i) => ({ day: i + 1, label }));
  return (
    <div className={`flex flex-wrap ${compact ? "gap-1" : "gap-2"}`}>
      {days.map(({ day, label }) => {
        const active = selected.has(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => {
              const next = new Set(selected);
              if (active) next.delete(day);
              else next.add(day);
              onChange(formatWeekdays(next));
            }}
            className={
              compact
                ? `min-w-[2rem] rounded border px-1.5 py-0.5 text-xs ${
                    active
                      ? "border-lime-600 bg-lime-50 font-medium text-lime-800"
                      : "border-slate-200 text-slate-500"
                  }`
                : `flex items-center gap-1 rounded border px-2 py-1 text-sm ${
                    active
                      ? "border-lime-600 bg-lime-50 text-lime-800"
                      : "border-slate-200 text-slate-600"
                  }`
            }
          >
            {compact ? (
              label
            ) : (
              <>
                <span
                  className={`inline-block h-2 w-2 rounded-full ${active ? "bg-lime-600" : "bg-slate-300"}`}
                />
                {label}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

type Props = {
  priceRules: PriceRuleRow[];
  basePrice: number;
  durationMinutes: number;
  bookingDurations: number[];
  bookableFrom?: string | null;
  bookableTo?: string | null;
  serviceWeekdays?: string;
  onChange: (priceRules: PriceRuleRow[]) => void;
  embedded?: boolean;
};

export const ServicePriceRulesEditor = memo(function ServicePriceRulesEditor({
  priceRules,
  basePrice,
  durationMinutes,
  bookingDurations,
  bookableFrom,
  bookableTo,
  serviceWeekdays,
  onChange,
  embedded = false,
}: Props) {
  const durations =
    bookingDurations.length > 0 ? bookingDurations : [durationMinutes];
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  function updateRule(idx: number, patch: Partial<PriceRuleRow>) {
    const rules = [...priceRules];
    rules[idx] = { ...rules[idx], ...patch };
    onChange(rules);
  }

  function updateRuleDurationPrice(idx: number, minutes: number, price: number) {
    const rule = priceRules[idx];
    const pricesByDuration = {
      ...rule.pricesByDuration,
      [minutes]: price,
    };
    updateRule(idx, {
      pricesByDuration,
      price: minutes === durationMinutes ? price : rule.price,
    });
  }

  function rulePrice(rule: PriceRuleRow, minutes: number): number {
    return rule.pricesByDuration?.[minutes] ?? rule.price;
  }

  function durationPriceValue(rule: PriceRuleRow, minutes: number): string {
    const key = priceDraftKey(rule.id, minutes);
    if (Object.prototype.hasOwnProperty.call(priceDrafts, key)) {
      return priceDrafts[key];
    }
    return String(rulePrice(rule, minutes));
  }

  function setDurationPriceDraft(ruleId: string, minutes: number, raw: string) {
    setPriceDrafts((prev) => ({
      ...prev,
      [priceDraftKey(ruleId, minutes)]: raw,
    }));
  }

  function clearDurationPriceDraft(ruleId: string, minutes: number) {
    const key = priceDraftKey(ruleId, minutes);
    setPriceDrafts((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function addRule() {
    const pricesByDuration = defaultPricesByDuration(
      basePrice,
      durationMinutes,
      durations,
    );
    onChange([
      ...priceRules,
      {
        id: `new-${Date.now()}`,
        weekdays: serviceWeekdays || "1,2,3,4,5,6,7",
        timeFrom: bookableFrom ?? "10:00",
        timeTo: bookableTo ?? "21:00",
        price: pricesByDuration[durationMinutes] ?? basePrice,
        pricesByDuration,
        sortOrder: priceRules.length + 1,
      },
    ]);
  }

  function removeRule(idx: number) {
    const rule = priceRules[idx];
    if (rule) {
      setPriceDrafts((prev) => {
        const next = { ...prev };
        for (const minutes of durations) {
          delete next[priceDraftKey(rule.id, minutes)];
        }
        return next;
      });
    }
    const rules = [...priceRules];
    rules.splice(idx, 1);
    onChange(rules);
  }

  const wrapperClass = embedded
    ? ""
    : "mt-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4";

  return (
    <div className={wrapperClass}>
      <h3 className="text-sm font-semibold text-slate-900">Тарифы по времени</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Стоимость зависит от времени начала записи — как при создании записи в журнале.
        Для праздничных дней используйте метку «Празд.».
      </p>

      {priceRules.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Используется только базовая цена. Добавьте тариф, если цена меняется по времени суток.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {priceRules.map((rule, idx) => (
            <div
              key={rule.id || idx}
              className="rounded-lg border border-slate-200 bg-white p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-600">
                  Тариф {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeRule(idx)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Удалить
                </button>
              </div>
              <div className="mb-2">
                <span className="mb-1 block text-[11px] text-slate-500">Дни</span>
                <WeekdayPicker
                  compact
                  value={rule.weekdays}
                  onChange={(weekdays) => updateRule(idx, { weekdays })}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-slate-500">С</span>
                  <input
                    type="time"
                    className={inputClass}
                    value={rule.timeFrom}
                    onChange={(e) => updateRule(idx, { timeFrom: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-slate-500">До</span>
                  <input
                    type="time"
                    className={inputClass}
                    value={rule.timeTo}
                    onChange={(e) => updateRule(idx, { timeTo: e.target.value })}
                  />
                </label>
              </div>
              <div
                className={`mt-2 grid gap-2 ${
                  durations.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"
                }`}
              >
                {durations.map((minutes) => (
                  <label key={minutes} className="block">
                    <span className="mb-1 block text-[11px] text-slate-500">
                      {minutes} мин, Br
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={inputClass}
                      value={durationPriceValue(rule, minutes)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw !== "" && !PRICE_DRAFT_RE.test(raw)) return;
                        // Local draft only — avoid re-rendering the whole branch editor on each keystroke.
                        setDurationPriceDraft(rule.id, minutes, raw);
                      }}
                      onBlur={() => {
                        const key = priceDraftKey(rule.id, minutes);
                        const raw = priceDrafts[key];
                        clearDurationPriceDraft(rule.id, minutes);
                        if (raw === undefined) return;
                        const parsed = parsePriceInput(raw);
                        updateRuleDurationPrice(idx, minutes, parsed ?? 0);
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addRule}
        className="mt-3 text-sm font-medium text-lime-700 hover:underline"
      >
        + Добавить тариф
      </button>
    </div>
  );
});
