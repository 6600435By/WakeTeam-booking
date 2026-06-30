import { SLOT_HEIGHT_PX } from "@/lib/calendar-grid";

export const JOURNAL_GRID_SCALES = [0.5, 0.65, 0.75, 1, 1.25, 1.5] as const;
export type JournalGridScale = (typeof JOURNAL_GRID_SCALES)[number];

const STORAGE_KEY = "journal-grid-scale";

export function getJournalSlotHeightPx(scale: JournalGridScale): number {
  return Math.round(SLOT_HEIGHT_PX * scale);
}

export function loadJournalGridScale(): JournalGridScale {
  if (typeof window === "undefined") return 1;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return 1;
  const parsed = Number(raw);
  if (JOURNAL_GRID_SCALES.includes(parsed as JournalGridScale)) {
    return parsed as JournalGridScale;
  }
  return 1;
}

export function saveJournalGridScale(scale: JournalGridScale) {
  localStorage.setItem(STORAGE_KEY, String(scale));
}

export function stepJournalGridScale(
  current: JournalGridScale,
  direction: -1 | 1,
): JournalGridScale {
  const index = JOURNAL_GRID_SCALES.indexOf(current);
  const next = Math.max(
    0,
    Math.min(JOURNAL_GRID_SCALES.length - 1, index + direction),
  );
  return JOURNAL_GRID_SCALES[next];
}

export function formatJournalGridScaleLabel(scale: JournalGridScale): string {
  return `${Math.round(scale * 100)}%`;
}
