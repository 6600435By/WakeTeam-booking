export type TimeInterval = { start: Date; end: Date };

export function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: TimeInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];
    if (cur.start <= last.end) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

export function totalMinutes(intervals: TimeInterval[]): number {
  return mergeIntervals(intervals).reduce(
    (sum, iv) => sum + Math.max(0, (iv.end.getTime() - iv.start.getTime()) / 60_000),
    0,
  );
}

export function intersectInterval(
  a: TimeInterval,
  b: TimeInterval,
): TimeInterval | null {
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  if (start >= end) return null;
  return { start, end };
}
