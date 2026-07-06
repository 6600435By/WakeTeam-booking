/** Доля продуктивного времени: (пульт + спот) / смена. */
export function calcEfficiencyPercent(
  shiftMinutes: number,
  panelMinutes: number,
  spotMinutes: number,
): number | null {
  if (shiftMinutes <= 0) return null;
  return Math.round(((panelMinutes + spotMinutes) / shiftMinutes) * 100);
}

/** Доля простоя относительно смены. */
export function calcIdleSharePercent(
  shiftMinutes: number,
  idleMinutes: number,
): number | null {
  if (shiftMinutes <= 0) return null;
  return Math.round((idleMinutes / shiftMinutes) * 100);
}

export type EfficiencyMetrics = {
  efficiencyPercent: number | null;
  idleSharePercent: number | null;
};

export function buildEfficiencyMetrics(
  shiftMinutes: number,
  panelMinutes: number,
  spotMinutes: number,
  idleMinutes: number,
): EfficiencyMetrics {
  return {
    efficiencyPercent: calcEfficiencyPercent(shiftMinutes, panelMinutes, spotMinutes),
    idleSharePercent: calcIdleSharePercent(shiftMinutes, idleMinutes),
  };
}
