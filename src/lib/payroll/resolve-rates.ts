import type { MemberPayRate } from "@prisma/client";

export type PayRateKind = "panel" | "spot" | "idle" | "shift";

export type RatesMap = Partial<Record<PayRateKind, number>>;

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
  const kinds: PayRateKind[] = ["panel", "spot", "idle", "shift"];
  for (const kind of kinds) {
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

/** Тарифы, доступные для назначения сотруднику по его роли. */
export function allowedPayRateKindsForMemberRole(
  role: string | null | undefined,
): PayRateKind[] {
  if (role === "super_admin" || role === "admin") {
    return ["panel", "spot", "idle", "shift"];
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
  }
}
