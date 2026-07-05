"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ScheduleForm = {
  isWorking: boolean;
  timeFrom: string;
  timeTo: string;
};

function formatDateTitle(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });
}

export function StaffDayScheduleModal({
  open,
  staffId,
  staffName,
  date,
  onClose,
  onSaved,
}: {
  open: boolean;
  staffId: string;
  staffName: string;
  date: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [form, setForm] = useState<ScheduleForm>({
    isWorking: true,
    timeFrom: "10:00",
    timeTo: "18:00",
  });
  const [isOverride, setIsOverride] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open || !staffId || !date) return;
    setLoading(true);
    setMessage("");
    fetch(`/api/admin/staff/${staffId}/schedule/day?date=${encodeURIComponent(date)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setMessage("Не удалось загрузить график");
          return;
        }
        setIsOverride(Boolean(d.isOverride));
        setForm({
          isWorking: d.effective?.isWorking ?? false,
          timeFrom: d.effective?.timeFrom ?? "10:00",
          timeTo: d.effective?.timeTo ?? "18:00",
        });
      })
      .catch(() => setMessage("Не удалось загрузить график"))
      .finally(() => setLoading(false));
  }, [open, staffId, date]);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/admin/staff/${staffId}/schedule/day?date=${encodeURIComponent(date)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      if (!res.ok) {
        setMessage("Ошибка сохранения");
        return;
      }
      setIsOverride(true);
      setMessage("Сохранено");
      onSaved?.();
    } catch {
      setMessage("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function resetToWeekdayDefault() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/admin/staff/${staffId}/schedule/day?date=${encodeURIComponent(date)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isWorking: false,
            timeFrom: "10:00",
            timeTo: "18:00",
            useWeekdayDefault: true,
          }),
        },
      );
      if (!res.ok) {
        setMessage("Ошибка сброса");
        return;
      }
      setIsOverride(false);
      setMessage("Восстановлен график по дню недели");
      onSaved?.();
      const reload = await fetch(
        `/api/admin/staff/${staffId}/schedule/day?date=${encodeURIComponent(date)}`,
      ).then((r) => r.json());
      if (!reload.error) {
        setForm({
          isWorking: reload.effective?.isWorking ?? false,
          timeFrom: reload.effective?.timeFrom ?? "10:00",
          timeTo: reload.effective?.timeTo ?? "18:00",
        });
      }
    } catch {
      setMessage("Ошибка сброса");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900">
            График на {formatDateTitle(date)}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-slate-600">{staffName}</p>
        <p className="text-xs text-slate-500">
          Изменения действуют только на выбранный день в журнале.
          {isOverride ? " Сейчас задано исключение для этой даты." : ""}
        </p>

        {loading ? (
          <p className="py-4 text-sm text-slate-500">Загрузка…</p>
        ) : (
          <div className="mt-2 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isWorking}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, isWorking: e.target.checked }))
                }
              />
              Рабочий день
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <input
                type="time"
                value={form.timeFrom}
                disabled={!form.isWorking}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, timeFrom: e.target.value }))
                }
                className="rounded border px-2 py-1"
              />
              <span>—</span>
              <input
                type="time"
                value={form.timeTo}
                disabled={!form.isWorking}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, timeTo: e.target.value }))
                }
                className="rounded border px-2 py-1"
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="rounded-lg bg-lime-600 px-4 py-2 text-sm text-white hover:bg-lime-700 disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          {isOverride && (
            <button
              type="button"
              onClick={resetToWeekdayDefault}
              disabled={saving || loading}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              По дню недели
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Закрыть
          </button>
        </div>

        {message && <p className="text-sm text-slate-600">{message}</p>}
      </DialogContent>
    </Dialog>
  );
}
