"use client";

import { PhotoUploadField } from "./PhotoUploadField";
import { ScheduleEditor, type ScheduleRow } from "./ScheduleEditor";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

export type StaffResourceRow = {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  photoUrl: string | null;
  isActive: boolean;
  isVisible: boolean;
};

type Props = {
  staff: StaffResourceRow;
  schedules?: ScheduleRow[];
  open: boolean;
  onToggle: () => void;
  descriptionLabel: string;
  photoLabel: string;
  onUpdate: (patch: Partial<StaffResourceRow>) => void;
  onSave: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  saveMessage?: string;
  deleteMessage?: string;
};

export function StaffResourceEditor({
  staff,
  schedules,
  open,
  onToggle,
  descriptionLabel,
  photoLabel,
  onUpdate,
  onSave,
  onDelete,
  deleting,
  saveMessage,
  deleteMessage,
}: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`font-medium ${staff.isActive && staff.isVisible ? "text-slate-900" : "text-slate-400"}`}
          >
            {staff.name}
          </span>
          {(!staff.isActive || !staff.isVisible) && (
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
              скрыт
            </span>
          )}
        </span>
        <span className="text-xs text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-slate-500">Название на карточке</span>
              <input
                className={inputClass}
                value={staff.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-slate-500">
                {descriptionLabel} (текст на фото)
              </span>
              <textarea
                className={`${inputClass} min-h-[72px]`}
                placeholder="Например: Фигуры — два кикера M, стол 16 м"
                value={staff.description ?? ""}
                onChange={(e) => onUpdate({ description: e.target.value })}
              />
            </label>
            <label className="block sm:col-span-2">
              <PhotoUploadField
                label={photoLabel}
                kind="staff"
                value={staff.photoUrl}
                onChange={(url) => onUpdate({ photoUrl: url })}
                title={staff.name}
                subtitle={staff.description}
                previewAlways
              />
            </label>
            <div className="flex flex-col gap-2 justify-end sm:col-span-2 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={staff.isActive}
                  onChange={(e) => onUpdate({ isActive: e.target.checked })}
                />
                Активен
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={staff.isVisible}
                  onChange={(e) => onUpdate({ isVisible: e.target.checked })}
                />
                В виджете
              </label>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              className="rounded-lg border border-lime-600 px-3 py-1.5 text-sm text-lime-800 hover:bg-lime-50"
            >
              Сохранить
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="text-sm text-red-600 hover:underline disabled:opacity-50"
              >
                {deleting ? "Удаление…" : "Удалить ресурс"}
              </button>
            )}
          </div>
          {saveMessage && (
            <p className="mt-1 text-xs text-slate-500">{saveMessage}</p>
          )}
          {deleteMessage && (
            <p className="mt-1 text-xs text-red-600">{deleteMessage}</p>
          )}
          <div className="mt-4">
            <h3 className="text-sm font-medium text-slate-700">Расписание работы</h3>
            <ScheduleEditor staffId={staff.id} schedules={schedules} embedded />
          </div>
        </div>
      )}
    </div>
  );
}
