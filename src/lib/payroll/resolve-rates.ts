import type { MemberPayRate } from "@prisma/client";
import { BRANCH_MANAGER_ROLE } from "@/lib/admin-roles";

export type PayRateKind = "panel" | "spot" | "idle" | "shift" | "monthly" | "other";

export type RatesMap = Partial<Record<PayRateKind, number>>;

const ALL_KINDS: PayRateKind[] = [
  "panel",
  "spot",
  "idle",
  "shift",
  "monthly",
  "other",
];

export function parseRatesSnapshot(json: string | null | undefined): RatesMap {
  if (!json) return {};
  try {
    return JSON.parse(json) as RatesMap;
  } catch {
    return {};
  }
}

export function serializeRatesSnapshot(rates: RatesMap): string {
  return JSON.stringify(rates);
}

export function resolveRatesForDate(
  rates: MemberPayRate[],
  date: string,
): RatesMap {
  const result: RatesMap = {};
  for (const kind of ALL_KINDS) {
    const match = rates
      .filter((r) => r.kind === kind)
      .filter(
        (r) =>
          r.effectiveFrom <= date &&
          (!r.effectiveTo || r.effectiveTo >= date),
      )
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    if (match) result[kind] = match.amount;
  }
  return result;
}

export function operatorRateKinds(): PayRateKind[] {
  return ["panel", "spot", "idle"];
}

export function adminRateKinds(): PayRateKind[] {
  return ["shift"];
}

export function managerRateKinds(): PayRateKind[] {
  return ["panel", "spot", "idle", "shift", "monthly", "other"];
}

/** Тарифы, доступные для назначения сотруднику по его роли. */
export function allowedPayRateKindsForMemberRole(
  role: string | null | undefined,
): PayRateKind[] {
  if (role === "super_admin" || role === "admin") {
    return ["panel", "spot", "idle", "shift", "monthly", "other"];
  }
  if (role === BRANCH_MANAGER_ROLE) {
    return managerRateKinds();
  }
  if (role === "branch_admin") {
    return adminRateKinds();
  }
  if (role === "branch_operator") {
    return operatorRateKinds();
  }
  return [];
}

export function rateKindLabel(kind: PayRateKind): string {
  switch (kind) {
    case "panel":
      return "Пульт";
    case "spot":
      return "Спот";
    case "idle":
      return "Простой";
    case "shift":
      return "Смена";
    case "monthly":
      return "Оклад (месяц)";
    case "other":
      return "Другое";
  }
}

export function resolveMonthlyRateForPeriod(
  rates: MemberPayRate[],
  periodFrom: string,
  periodTo: string,
): number | null {
  const inPeriod = rates
    .filter((r) => r.kind === "monthly")
    .filter(
      (r) =>
        r.effectiveFrom <= periodTo &&
        (!r.effectiveTo || r.effectiveTo >= periodFrom),
    )
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  return inPeriod?.amount ?? null;
}
