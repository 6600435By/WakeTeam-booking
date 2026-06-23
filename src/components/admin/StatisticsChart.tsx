"use client";

import type { DaySeriesPoint } from "@/lib/statistics-constants";

type Props = {
  series: DaySeriesPoint[];
};

const COLORS = {
  count: "#8b5cf6",
  price: "#14b8a6",
  duration: "#ec4899",
};

export function StatisticsChart({ series }: Props) {
  if (series.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-400">Нет данных для графика</p>
    );
  }

  const width = 800;
  const height = 220;
  const pad = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const maxCount = Math.max(...series.map((s) => s.count), 1);
  const maxPrice = Math.max(...series.map((s) => s.price), 1);
  const maxDuration = Math.max(...series.map((s) => s.durationMinutes), 1);

  function linePath(
    key: "count" | "price" | "durationMinutes",
    max: number,
  ): string {
    if (series.length === 1) {
      const y = pad.top + innerH - (series[0][key] / max) * innerH;
      return `M ${pad.left} ${y} L ${pad.left + innerW} ${y}`;
    }
    return series
      .map((point, i) => {
        const x = pad.left + (i / (series.length - 1)) * innerW;
        const y = pad.top + innerH - (point[key] / max) * innerH;
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }

  const xLabels = series.filter(
    (_, i) => i === 0 || i === series.length - 1 || i % Math.ceil(series.length / 6) === 0,
  );

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-full"
        role="img"
        aria-label="График записей по дням"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.top + innerH * (1 - t);
          return (
            <line
              key={t}
              x1={pad.left}
              x2={width - pad.right}
              y1={y}
              y2={y}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
          );
        })}
        <path
          d={linePath("count", maxCount)}
          fill="none"
          stroke={COLORS.count}
          strokeWidth={2}
        />
        <path
          d={linePath("price", maxPrice)}
          fill="none"
          stroke={COLORS.price}
          strokeWidth={2}
        />
        <path
          d={linePath("durationMinutes", maxDuration)}
          fill="none"
          stroke={COLORS.duration}
          strokeWidth={2}
        />
        {xLabels.map((point) => {
          const i = series.indexOf(point);
          const x = pad.left + (i / Math.max(series.length - 1, 1)) * innerW;
          const label = point.date.slice(5).replace("-", ".");
          return (
            <text
              key={point.date}
              x={x}
              y={height - 6}
              textAnchor="middle"
              className="fill-slate-400 text-[10px]"
            >
              {label}
            </text>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: COLORS.count }} />
          Записей
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: COLORS.price }} />
          Стоимость, Br
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: COLORS.duration }} />
          Длительность, мин
        </span>
      </div>
    </div>
  );
}
