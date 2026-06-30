"use client";

import { useEffect, useState } from "react";
import { workShiftStatusLabel } from "@/lib/payroll/spot-task-status";

type SchedulePreview = {
  date: string;
  isTomorrow: boolean;
  shift: {
    id: string;
    status: string;
    plannedStart: string | null;
    plannedEnd: string | null;
    plannedStaffName: string | null;
    workAsAdmin: boolean;
  } | null;
  tasks: { description: string; plannedLabel: string | null }[];
};

export function ShiftTomorrowBanner() {
  const [preview, setPreview] = useState<SchedulePreview | null>(null);

  useEffect(() => {
    fetch("/api/admin/my-schedule")
      .then((r) => r.json())
      .then((d) => {
        if (d.shift || d.tasks?.length > 0) setPreview(d);
      })
      .catch(() => {});
  }, []);

  if (!preview?.shift) return null;

  const { shift } = preview;
  const dayLabel = preview.isTomorrow ? "Завтра" : "Скоро";
  const time =
    shift.plannedStart && shift.plannedEnd
      ? `${shift.plannedStart}–${shift.plannedEnd}`
      : null;

  return (
    <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm">
      <p className="font-medium text-violet-900">
        {dayLabel}: смена {time ? ` ${time}` : ""}
        {shift.workAsAdmin
          ? " · как админ"
          : shift.plannedStaffName
            ? ` · реверс ${shift.plannedStaffName}`
            : ""}
      </p>
      <p className="mt-0.5 text-xs text-violet-700">
        Статус: {workShiftStatusLabel(shift.status)}
        {preview.tasks.length > 0 &&
          ` · заданий: ${preview.tasks.length}`}
      </p>
    </div>
  );
}
