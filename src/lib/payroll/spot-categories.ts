export const SPOT_CATEGORIES = [
  { value: "cleaning", label: "Уборка" },
  { value: "tech", label: "Техобслуживание" },
  { value: "construction", label: "Строительные работы" },
  { value: "other", label: "Другое" },
] as const;

export const BRANCH_WIDE_TASK_PRESETS = [
  "Уборка спота",
  "Проверка и чистка кофеаппарата",
  "Вынос мусора",
] as const;

export type SpotCategory = (typeof SPOT_CATEGORIES)[number]["value"];

export function spotCategoryLabel(value: string | null | undefined): string {
  if (!value) return "";
  return SPOT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
