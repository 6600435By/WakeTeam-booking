export type JournalResourceKind = "all" | "revers" | "sup";

const KIND_STORAGE_KEY = "journal-resource-kind";
const COLLAPSED_STORAGE_KEY = "journal-collapsed-columns";

export const RESOURCE_KIND_OPTIONS: {
  value: JournalResourceKind;
  label: string;
}[] = [
  { value: "all", label: "Все" },
  { value: "revers", label: "Реверсы" },
  { value: "sup", label: "Сапборды" },
];

export function loadJournalResourceKind(branchId: string): JournalResourceKind {
  if (typeof window === "undefined" || !branchId) return "all";
  try {
    const raw = localStorage.getItem(KIND_STORAGE_KEY);
    if (!raw) return "all";
    const parsed = JSON.parse(raw) as Record<string, JournalResourceKind>;
    const kind = parsed[branchId];
    if (kind === "revers" || kind === "sup" || kind === "all") return kind;
    return "all";
  } catch {
    return "all";
  }
}

export function saveJournalResourceKind(
  branchId: string,
  kind: JournalResourceKind,
) {
  if (!branchId) return;
  try {
    const raw = localStorage.getItem(KIND_STORAGE_KEY);
    const parsed: Record<string, JournalResourceKind> = raw
      ? (JSON.parse(raw) as Record<string, JournalResourceKind>)
      : {};
    if (kind === "all") {
      delete parsed[branchId];
    } else {
      parsed[branchId] = kind;
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
  staffKind: string,
  filter: JournalResourceKind,
): boolean {
  if (filter === "all") return true;
  return staffKind === filter;
}

export function staffMatchesResourceFilter(
  staff: { id: string; kind: string },
  filter: JournalResourceKind,
): boolean {
  return matchesResourceKind(staff.kind, filter);
}
