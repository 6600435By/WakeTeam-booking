export type DaySeriesPoint = {
  date: string;
  count: number;
  price: number;
  durationMinutes: number;
};

export const SOURCE_OPTIONS = [
  { value: "widget", label: "Виджет" },
  { value: "admin", label: "Админ" },
] as const;

export function sourceLabel(source: string): string {
  return SOURCE_OPTIONS.find((s) => s.value === source)?.label ?? source;
}
