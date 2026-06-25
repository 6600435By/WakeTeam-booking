"use client";

import { useEffect, useState } from "react";

type ScheduleRow = {
  weekday: number;
  isWorking: boolean;
  timeFrom: string;
  timeTo: string;
};

const WEEKDAYS = [
  { n: 1, label: "Пн" },
  { n: 2, label: "Вт" },
  { n: 3, label: "Ср" },
  { n: 4, label: "Чт" },
  { n: 5, label: "Пт" },
  { n: 6, label: "Сб" },
  { n: 7, label: "Вс" },
];

export function ScheduleEditor({
  staffId,
  embedded = false,
}: {
  staffId: string;
  embedded?: boolean;
}) {
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [staffName, setStaffName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/admin/staff/${staffId}/schedule`)
      .then((r) => r.json())
      .then((d) => {
        setStaffName(d.staff?.name ?? "");
        const map = new Map<number, ScheduleRow>(
          (d.staff?.schedules ?? []).map((s: ScheduleRow) => [s.weekday, s]),
        );
        setSchedules(
          WEEKDAYS.map((w): ScheduleRow => {
            const row = map.get(w.n);
            return (
              row ?? {
                weekday: w.n,
                isWorking: false,
                timeFrom: "10:00",
                timeTo: "18:00",
              }
            );
          }),
        );
      });
  }, [staffId]);

  async function save() {
    setSaving(true);
    setMessage("");
    const res = await fetch(`/api/admin/staff/${staffId}/schedule`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedules }),
    });
    setSaving(false);
    setMessage(res.ok ? "Сохранено" : "Ошибка сохранения");
  }

  return (
    <div
      className={
        embedded
          ? "mt-2"
          : "rounded-lg bg-white p-4 shadow ring-1 ring-slate-200"
      }
    >
      {!embedded && <h2 className="font-semibold text-slate-900">{staffName}</h2>}
      <div className={embedded ? "mt-0 space-y-2" : "mt-4 space-y-2"}>
        {WEEKDAYS.map((w, i) => (
          <div key={w.n} className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex w-16 items-center gap-1">
              <input
                type="checkbox"
                checked={schedules[i]?.isWorking ?? false}
                onChange={(e) => {
                  const next = [...schedules];
                  next[i] = { ...next[i], isWorking: e.target.checked };
                  setSchedules(next);
                }}
              />
              {w.label}
            </label>
            <input
              type="time"
              value={schedules[i]?.timeFrom ?? "10:00"}
              disabled={!schedules[i]?.isWorking}
              onChange={(e) => {
                const next = [...schedules];
                next[i] = { ...next[i], timeFrom: e.target.value };
                setSchedules(next);
              }}
              className="rounded border px-2 py-1"
            />
            <span>—</span>
            <input
              type="time"
              value={schedules[i]?.timeTo ?? "18:00"}
              disabled={!schedules[i]?.isWorking}
              onChange={(e) => {
                const next = [...schedules];
                next[i] = { ...next[i], timeTo: e.target.value };
                setSchedules(next);
              }}
              className="rounded border px-2 py-1"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 rounded-lg bg-lime-600 px-4 py-2 text-white hover:bg-lime-700 disabled:opacity-50"
      >
        {saving ? "Сохранение…" : "Сохранить график"}
      </button>
      {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
    </div>
  );
}
