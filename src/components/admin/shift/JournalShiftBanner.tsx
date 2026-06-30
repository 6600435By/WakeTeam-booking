"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ShiftBannerData = {
  shift: {
    id: string;
    status: string;
  };
  reverseAssignments: { staffName: string; endedAt: string | null }[];
  summary: {
    panelMinutes: number;
    lines: { kind: string; hoursLabel: string }[];
  };
};

function panelLabel(data: ShiftBannerData): string {
  const line = data.summary.lines.find((l) => l.kind === "panel");
  return line?.hoursLabel ?? "0";
}

export function JournalShiftBanner() {
  const [data, setData] = useState<ShiftBannerData | null>(null);

  useEffect(() => {
    fetch("/api/admin/work-shifts")
      .then((r) => r.json())
      .then((d) => {
        if (d.today?.shift?.status === "open") setData(d.today);
        else setData(null);
      })
      .catch(() => setData(null));
  }, []);

  if (!data) return null;

  const active = data.reverseAssignments.find((a) => !a.endedAt);

  return (
    <Link
      href="/admin/shift"
      className="mb-3 flex items-center justify-between rounded-lg border border-lime-200 bg-lime-50 px-3 py-2 text-sm text-lime-900 hover:bg-lime-100"
    >
      <span>
        Смена открыта
        {active ? ` · ${active.staffName}` : ""}
        {" · "}Пульт: {panelLabel(data)}
      </span>
      <span className="text-xs font-medium">Учёт времени →</span>
    </Link>
  );
}
