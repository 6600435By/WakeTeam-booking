/** Услуги-«тарифы» из старой схемы — дублируют priceRules одного вейка. */
export function isLegacyTariffServiceName(name: string) {
  return /будний день|выходной день/i.test(name);
}

export function isLegacyTariffService(service: { name: string }) {
  return isLegacyTariffServiceName(service.name);
}

export function catalogServices<T extends { name: string }>(services: T[]): T[] {
  return services.filter((s) => !isLegacyTariffService(s));
}

export function branchHasServiceKind<T extends { name: string; kind?: string }>(
  services: T[],
  kind: string,
) {
  return catalogServices(services).some((s) => s.kind === kind);
}

export const SERVICE_KIND_OPTIONS = [
  { kind: "wake", label: "Вейкбординг" },
  { kind: "sup", label: "Сапборд" },
] as const;

export type PresetServiceKind = (typeof SERVICE_KIND_OPTIONS)[number]["kind"];

export type ServiceKind = PresetServiceKind | "custom";

export function availableServiceKinds<T extends { name: string; kind?: string }>(
  services: T[],
) {
  return SERVICE_KIND_OPTIONS.filter(
    (option) => !branchHasServiceKind(services, option.kind),
  );
}

export function isCustomService(service: { kind?: string }) {
  return service.kind === "custom";
}

export function usesDedicatedResources(service: { kind?: string }) {
  return isCustomService(service);
}

export function isStaffBasedService(service: { kind?: string }) {
  return service.kind === "wake" || service.kind === "custom";
}

export function staffExclusiveToCustomService(
  staffId: string,
  services: Array<{ kind?: string; name: string; staff: { staff: { id: string } }[] }>,
): boolean {
  const links = catalogServices(services).filter((s) =>
    s.staff.some((x) => x.staff.id === staffId),
  );
  if (links.length === 0) return false;
  return links.every((s) => s.kind === "custom");
}

export function serviceResourceLabel(service: {
  name: string;
  resourceLabel?: string | null;
}) {
  const label = service.resourceLabel?.trim();
  return label || service.name;
}

export function defaultWakeLikePriceRules(basePrice = 15) {
  return [
    {
      weekdays: "1,2,3,4,5",
      timeFrom: "10:00",
      timeTo: "16:00",
      price: basePrice,
      sortOrder: 1,
    },
    {
      weekdays: "1,2,3,4,5",
      timeFrom: "16:00",
      timeTo: "21:00",
      price: 30,
      sortOrder: 2,
    },
    {
      weekdays: "6,7",
      timeFrom: "09:00",
      timeTo: "21:00",
      price: 30,
      sortOrder: 3,
    },
    {
      weekdays: "8",
      timeFrom: "09:00",
      timeTo: "21:00",
      price: 30,
      sortOrder: 4,
    },
  ];
}
