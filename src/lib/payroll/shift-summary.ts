import type { SpotWorkEntry } from "@prisma/client";
import { formatTimeMinsk } from "@/lib/time";
import { spotCategoryLabel } from "./spot-categories";
import {
  type RatesMap,
  rateKindLabel,
  type PayRateKind,
} from "./resolve-rates";

export type ShiftLineItem = {
  kind: PayRateKind | "shift";
  label: string;
  minutes: number;
  hoursLabel: string;
  rate: number | null;
  amount: number;
  rateMissing: boolean;
  details?: { time: string; comment: string }[];
};

export type ShiftSummary = {
  shiftMinutes: number;
  panelMinutes: number;
  spotMinutes: number;
  idleMinutes: number;
  totalAmount: number;
  lines: ShiftLineItem[];
  isOperator: boolean;
};

/** Человекочитаемая длительность: «2 ч 15 мин». */
export function formatDurationMinutes(minutes: number): string {
  if (minutes <= 0) return "0 мин";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

export function calcSpotMinutes(entries: SpotWorkEntry[], now = new Date()): number {
  let total = 0;
  for (const e of entries) {
    if (e.isActive) {
      total += Math.max(0, (now.getTime() - e.startedAt.getTime()) / 60_000);
    } else if (e.endedAt) {
      total += Math.max(0, (e.endedAt.getTime() - e.startedAt.getTime()) / 60_000);
    }
  }
  return Math.round(total);
}

function lineAmount(minutes: number, rate: number | null | undefined): {
  amount: number;
  rateMissing: boolean;
} {
  if (rate == null) return { amount: 0, rateMissing: true };
  return { amount: (minutes / 60) * rate, rateMissing: false };
}

export function buildShiftSummary(input: {
  isOperator: boolean;
  shiftMinutes: number;
  panelMinutes: number;
  spotMinutes: number;
  idleMinutes: number;
  rates: RatesMap;
  spotEntries: SpotWorkEntry[];
}): ShiftSummary {
  const { isOperator, shiftMinutes, panelMinutes, spotMinutes, idleMinutes, rates, spotEntries } =
    input;

  const lines: ShiftLineItem[] = [];

  if (isOperator) {
    const panelPay = lineAmount(panelMinutes, rates.panel);
    lines.push({
      kind: "panel",
      label: rateKindLabel("panel"),
      minutes: panelMinutes,
      hoursLabel: formatDurationMinutes(panelMinutes),
      rate: rates.panel ?? null,
      amount: panelPay.amount,
      rateMissing: panelPay.rateMissing,
    });

    const spotDetails = spotEntries
      .filter((e) => !e.isActive && e.endedAt)
      .map((e) => ({
        time: `${formatTimeMinsk(e.startedAt.toISOString())}–${formatTimeMinsk(e.endedAt!.toISOString())}`,
        comment: [spotCategoryLabel(e.category), e.comment].filter(Boolean).join(" — "),
      }));

    const spotPay = lineAmount(spotMinutes, rates.spot);
    lines.push({
      kind: "spot",
      label: rateKindLabel("spot"),
      minutes: spotMinutes,
      hoursLabel: formatDurationMinutes(spotMinutes),
      rate: rates.spot ?? null,
      amount: spotPay.amount,
      rateMissing: spotPay.rateMissing,
      details: spotDetails,
    });

    const idlePay = lineAmount(idleMinutes, rates.idle);
    lines.push({
      kind: "idle",
      label: rateKindLabel("idle"),
      minutes: idleMinutes,
      hoursLabel: formatDurationMinutes(idleMinutes),
      rate: rates.idle ?? null,
      amount: idlePay.amount,
      rateMissing: idlePay.rateMissing,
    });
  } else {
    const shiftPay = lineAmount(shiftMinutes, rates.shift);
    lines.push({
      kind: "shift",
      label: "Часы смены",
      minutes: shiftMinutes,
      hoursLabel: formatDurationMinutes(shiftMinutes),
      rate: rates.shift ?? null,
      amount: shiftPay.amount,
      rateMissing: shiftPay.rateMissing,
    });
  }

  const totalAmount = lines.reduce((s, l) => s + l.amount, 0);

  return {
    shiftMinutes,
    panelMinutes,
    spotMinutes,
    idleMinutes,
    totalAmount,
    lines,
    isOperator,
  };
}

export function formatMoney(amount: number): string {
  return amount.toFixed(2);
}
