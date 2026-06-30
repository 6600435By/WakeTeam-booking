"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SHIFT_CHANGE_REQUEST_TYPES,
  shiftChangeRequestStatusClass,
  shiftChangeRequestStatusLabel,
} from "@/lib/payroll/shift-change-request";
import {
  spotTaskStatusClass,
  spotTaskStatusLabel,
  workShiftStatusClass,
  workShiftStatusLabel,
} from "@/lib/payroll/spot-task-status";

type CalendarShift = {
  id: string;
  memberId: string;
  status: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedStaffName: string | null;
  workAsAdmin: boolean;
};

type CalendarTask = {
  id: string;
  assigneeMemberId: string;
  description: string;
  plannedLabel: string | null;
  status: string;
};

type DayData = {
  date: string;
  shifts: CalendarShift[];
  tasks: CalendarTask[];
};

type Props = {
  days: DayData[];
  memberId: string;
  onRequestChange?: (date: string, workShiftId?: string) => void;
};

export function ShiftMyScheduleList({ days, memberId, onRequestChange }: Props) {
  const filtered = days
    .map((d) => ({
      date: d.date,
      shifts: d.shifts.filter((s) => s.memberId === memberId),
      tasks: d.tasks.filter((t) => t.assigneeMemberId === memberId),
    }))
    .filter((d) => d.shifts.length > 0 || d.tasks.length > 0);

  if (filtered.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        В этом месяце у вас нет запланированных смен и заданий
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {filtered.map((d) => (
        <li key={d.date} className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 font-medium text-slate-900">
            {new Date(d.date + "T12:00:00").toLocaleDateString("ru-RU", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          {d.shifts.map((s) => (
            <div
              key={s.id}
              className="mb-2 flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">Смена</p>
                <p className="text-xs text-slate-500">
                  {s.plannedStart && s.plannedEnd
                    ? `${s.plannedStart}–${s.plannedEnd}`
                    : "Время не указано"}
                  {s.workAsAdmin
                    ? " · как админ"
                    : s.plannedStaffName
                      ? ` · ${s.plannedStaffName}`
                      : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${workShiftStatusClass(s.status)}`}
                >
                  {workShiftStatusLabel(s.status)}
                </span>
                {onRequestChange && s.status === "scheduled" && (
                  <button
                    type="button"
                    className="text-[10px] text-lime-700"
                    onClick={() => onRequestChange(d.date, s.id)}
                  >
                    Заявка на изменение
                  </button>
                )}
              </div>
            </div>
          ))}
          {d.tasks.map((t) => (
            <div
              key={t.id}
              className="mb-2 flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{t.description}</p>
                {t.plannedLabel && (
                  <p className="text-xs text-slate-500">{t.plannedLabel}</p>
                )}
              </div>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${spotTaskStatusClass(t.status)}`}
              >
                {spotTaskStatusLabel(t.status)}
              </span>
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}
