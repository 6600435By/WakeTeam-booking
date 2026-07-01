import {
  catalogServices,
  serviceResourceLabel,
} from "@/lib/admin/service-catalog";

/** `"all"` or a service id in the current branch. */
export type JournalResourceFilter = "all" | (string & {});

/** @deprecated use JournalResourceFilter */
export type JournalResourceKind = JournalResourceFilter;

const KIND_STORAGE_KEY = "journal-resource-kind";
const COLLAPSED_STORAGE_KEY = "journal-collapsed-columns";

export type JournalServiceOption = {
  id: string;
  name: string;
  kind?: string;
  resourceLabel?: string | null;
  isActive?: boolean;
};

export function buildJournalResourceOptions(
  services: JournalServiceOption[],
): { value: JournalResourceFilter; label: string }[] {
  const active = catalogServices(services).filter((s) => s.isActive !== false);
  return [
    { value: "all", label: "Все" },
    ...active.map((s) => ({
      value: s.id as JournalResourceFilter,
      label: serviceResourceLabel(s),
    })),
  ];
}

export function buildStaffServiceLinks(
  services: Array<{ id: string; staff: Array<{ staffId: string }> }>,
): Map<string, Set<string>> {
  const links = new Map<string, Set<string>>();
  for (const service of services) {
    for (const row of service.staff) {
      const set = links.get(row.staffId) ?? new Set<string>();
      set.add(service.id);
      links.set(row.staffId, set);
    }
  }
  return links;
}

export function normalizeStoredResourceFilter(
  stored: string | undefined,
  services: JournalServiceOption[],
): JournalResourceFilter {
  if (!stored || stored === "all") return "all";
  if (catalogServices(services).some((s) => s.id === stored)) {
    return stored;
  }
  if (stored === "revers") {
    const wake = catalogServices(services).find((s) => s.kind === "wake");
    return wake?.id ?? "all";
  }
  if (stored === "sup") {
    const sup = catalogServices(services).find((s) => s.kind === "sup");
    return sup?.id ?? "all";
  }
  return "all";
}

export function loadJournalResourceKind(branchId: string): JournalResourceFilter {
  if (typeof window === "undefined" || !branchId) return "all";
  try {
    const raw = localStorage.getItem(KIND_STORAGE_KEY);
    if (!raw) return "all";
    const parsed = JSON.parse(raw) as Record<string, string>;
    return normalizeStoredResourceFilter(parsed[branchId], []);
  } catch {
    return "all";
  }
}

export function loadJournalResourceFilter(
  branchId: string,
  services: JournalServiceOption[],
): JournalResourceFilter {
  if (typeof window === "undefined" || !branchId) return "all";
  try {
    const raw = localStorage.getItem(KIND_STORAGE_KEY);
    if (!raw) return "all";
    const parsed = JSON.parse(raw) as Record<string, string>;
    return normalizeStoredResourceFilter(parsed[branchId], services);
  } catch {
    return "all";
  }
}

export function saveJournalResourceKind(
  branchId: string,
  kind: JournalResourceFilter,
) {
  saveJournalResourceFilter(branchId, kind);
}

export function saveJournalResourceFilter(
  branchId: string,
  filter: JournalResourceFilter,
) {
  if (!branchId) return;
  try {
    const raw = localStorage.getItem(KIND_STORAGE_KEY);
    const parsed: Record<string, string> = raw
      ? (JSON.parse(raw) as Record<string, string>)
      : {};
    if (filter === "all") {
      delete parsed[branchId];
    } else {
      parsed[branchId] = filter;
    }
    if (Object.keys(parsed).length === 0) {
      localStorage.removeItem(KIND_STORAGE_KEY);
    } else {
      localStorage.setItem(KIND_STORAGE_KEY, JSON.stringify(parsed));
    }
  } catch {
    /* ignore */
  }
}

export function loadJournalCollapsedColumns(branchId: string): string[] {
  if (typeof window === "undefined" || !branchId) return [];
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return parsed[branchId] ?? [];
  } catch {
    return [];
  }
}

export function saveJournalCollapsedColumns(branchId: string, staffIds: string[]) {
  if (!branchId) return;
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    const parsed: Record<string, string[]> = raw
      ? (JSON.parse(raw) as Record<string, string[]>)
      : {};
    if (staffIds.length === 0) {
      delete parsed[branchId];
    } else {
      parsed[branchId] = staffIds;
    }
    if (Object.keys(parsed).length === 0) {
      localStorage.removeItem(COLLAPSED_STORAGE_KEY);
    } else {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(parsed));
    }
  } catch {
    /* ignore */
  }
}

export function matchesResourceKind(
  staffId: string,
  filter: JournalResourceFilter,
  staffServiceLinks: Map<string, Set<string>>,
): boolean {
  if (filter === "all") return true;
  return staffServiceLinks.get(staffId)?.has(filter) ?? false;
}

export function staffMatchesResourceFilter(
  staff: { id: string },
  filter: JournalResourceFilter,
  staffServiceLinks: Map<string, Set<string>>,
): boolean {
  return matchesResourceKind(staff.id, filter, staffServiceLinks);
}

/** @deprecated use matchesResourceKind with staffServiceLinks */
export function matchesResourceKindByStaffKind(
  staffKind: string,
  filter: JournalResourceFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "revers" || filter === "sup") return staffKind === filter;
  return true;
}

/** @deprecated use RESOURCE_KIND_OPTIONS from buildJournalResourceOptions */
export const RESOURCE_KIND_OPTIONS = [
  { value: "all" as const, label: "Все" },
  { value: "revers" as const, label: "Реверсы" },
  { value: "sup" as const, label: "Сапборды" },
];
