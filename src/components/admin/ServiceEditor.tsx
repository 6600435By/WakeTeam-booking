"use client";

import { catalogStaffByKind } from "@/lib/admin/staff-catalog";
import {
  isStaffBasedService,
  serviceResourceLabel,
  usesDedicatedResources,
} from "@/lib/admin/service-catalog";
import {
  StaffResourceEditor,
  type StaffResourceRow,
} from "./StaffResourceEditor";
import type { ScheduleRow } from "./ScheduleEditor";
import {
  ServicePriceRulesEditor,
  WeekdayPicker,
  type PriceRuleRow,
} from "./ServicePriceRulesEditor";

type StaffRow = {
  id: string;
  name: string;
  kind: string;
};

export type ServiceRow = {
  id: string;
  name: string;
  kind?: string;
  description: string | null;
  resourceLabel?: string | null;
  price: number;
  durationMinutes: number;
  allowedDurations: string;
  bookableFrom: string | null;
  bookableTo: string | null;
  weekdays: string;
  isActive: boolean;
  isOnlineBookable: boolean;
  priceRules?: PriceRuleRow[];
  staff: { staff: { id: string; name: string } }[];
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

type Props = {
  service: ServiceRow;
  staff: StaffRow[];
  branchStaff?: (StaffResourceRow & { schedules?: ScheduleRow[] })[];
  expandedStaffId?: string | null;
  onExpandStaff?: (id: string | null) => void;
  onUpdateStaff?: (id: string, patch: Partial<StaffResourceRow>) => void;
  onSaveStaff?: (staff: StaffResourceRow) => void;
  onDeleteStaff?: (staff: StaffResourceRow) => void;
  onAddResource?: () => void;
  staffSaveMessage?: Record<string, string>;
  staffDeleteMessage?: Record<string, string>;
  deletingStaffId?: string | null;
  addingResource?: boolean;
  onUpdate: (patch: Partial<ServiceRow>) => void;
  onToggleStaff: (staffId: string) => void;
  onSave: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  saveMessage?: string;
  deleteMessage?: string;
};

export function ServiceEditor({
  service,
  staff,
  branchStaff = [],
  expandedStaffId,
  onExpandStaff,
  onUpdateStaff,
  onSaveStaff,
  onDeleteStaff,
  onAddResource,
  staffSaveMessage,
  staffDeleteMessage,
  deletingStaffId,
  addingResource,
  onUpdate,
  onToggleStaff,
  onSave,
  onDelete,
  deleting,
  saveMessage,
  deleteMessage,
}: Props) {
  const dedicated = usesDedicatedResources(service);
  const resourceLabel = serviceResourceLabel(service);
  const linkedStaff = dedicated
    ? service.staff
        .map((link) => branchStaff.find((s) => s.id === link.staff.id))
        .filter(
          (s): s is StaffResourceRow & { schedules?: ScheduleRow[] } => !!s,
        )
    : [];
  const sharedStaff = !dedicated
    ? catalogStaffByKind(
        staff,
        service.kind === "sup" ? "sup" : "revers",
      )
    : [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Название услуги</span>
            <input
              className={`${inputClass} max-w-md font-semibold`}
              value={service.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-3 pt-5 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={service.isActive}
              onChange={(e) => onUpdate({ isActive: e.target.checked })}
            />
            Активна
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={service.isOnlineBookable}
              onChange={(e) => onUpdate({ isOnlineBookable: e.target.checked })}
            />
            В виджете
          </label>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">
            Длительности записи, мин
          </span>
          <input
            className={inputClass}
            value={service.allowedDurations}
            onChange={(e) => onUpdate({ allowedDurations: e.target.value })}
            placeholder="10,30,60"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">
            Базовая цена, Br / {service.durationMinutes} мин
          </span>
          <input
            type="number"
            className={inputClass}
            value={service.price}
            onChange={(e) =>
              onUpdate({ price: parseFloat(e.target.value) || 0 })
            }
          />
          <span className="mt-1 block text-[11px] text-slate-400">
            Если время не попало ни в один тариф ниже
          </span>
        </label>
      </div>

      {dedicated ? (
        <div className="mt-6">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Название ресурсов
            </span>
            <input
              className={`${inputClass} max-w-md`}
              value={
                service.resourceLabel === null ||
                service.resourceLabel === undefined
                  ? service.name
                  : service.resourceLabel
              }
              onChange={(e) => onUpdate({ resourceLabel: e.target.value })}
              placeholder={service.name}
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Колонки в журнале и выбор ресурса при записи на эту услугу
          </p>
          <div className="mt-3 space-y-3">
            {linkedStaff.map((st) => (
              <StaffResourceEditor
                key={st.id}
                staff={st}
                schedules={st.schedules}
                open={expandedStaffId === st.id}
                onToggle={() =>
                  onExpandStaff?.(expandedStaffId === st.id ? null : st.id)
                }
                descriptionLabel="Подпись в виджете"
                photoLabel={`Фото: ${resourceLabel}`}
                onUpdate={(patch) => onUpdateStaff?.(st.id, patch)}
                onSave={() => onSaveStaff?.(st)}
                onDelete={() => onDeleteStaff?.(st)}
                deleting={deletingStaffId === st.id}
                saveMessage={staffSaveMessage?.[st.id]}
                deleteMessage={staffDeleteMessage?.[st.id]}
              />
            ))}
            {linkedStaff.length === 0 && (
              <p className="text-sm text-slate-500">
                Добавьте первый «{resourceLabel}» для этой услуги
              </p>
            )}
            <button
              type="button"
              disabled={addingResource}
              onClick={onAddResource}
              className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-lime-500 hover:text-lime-800 disabled:opacity-50"
            >
              + Добавить {resourceLabel}
            </button>
          </div>
        </div>
      ) : (
        sharedStaff.length > 0 && (
          <div className="mt-4">
            <span className="text-xs font-medium text-slate-600">
              Ресурсы в журнале
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {sharedStaff.map((st) => {
                const checked = service.staff.some((x) => x.staff.id === st.id);
                return (
                  <label
                    key={st.id}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleStaff(st.id)}
                    />
                    {st.name}
                  </label>
                );
              })}
            </div>
          </div>
        )
      )}

      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Время работы услуги</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Когда можно создавать записи в журнале
          {isStaffBasedService(service) ? " и виджете" : ""}. Для привязанных
          ресурсов расписание обновляется автоматически.
        </p>
        <div className="mt-3">
          <span className="mb-1.5 block text-xs text-slate-500">Дни недели</span>
          <WeekdayPicker
            value={service.weekdays}
            onChange={(weekdays) => onUpdate({ weekdays })}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Запись с</span>
            <input
              type="time"
              className={inputClass}
              value={service.bookableFrom ?? ""}
              onChange={(e) =>
                onUpdate({ bookableFrom: e.target.value || null })
              }
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Запись до</span>
            <input
              type="time"
              className={inputClass}
              value={service.bookableTo ?? ""}
              onChange={(e) =>
                onUpdate({ bookableTo: e.target.value || null })
              }
            />
          </label>
        </div>
      </div>

      <ServicePriceRulesEditor
        priceRules={service.priceRules ?? []}
        basePrice={service.price}
        durationMinutes={service.durationMinutes}
        bookableFrom={service.bookableFrom}
        bookableTo={service.bookableTo}
        serviceWeekdays={service.weekdays}
        onChange={(priceRules) => onUpdate({ priceRules })}
      />

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={onSave}
          className="rounded-lg bg-lime-600 px-4 py-2 text-sm font-medium text-white hover:bg-lime-700"
        >
          Сохранить услугу
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            {deleting ? "Удаление…" : "Удалить услугу"}
          </button>
        )}
      </div>
      {saveMessage && (
        <p className="mt-2 text-xs text-slate-500">{saveMessage}</p>
      )}
      {deleteMessage && (
        <p className="mt-2 text-xs text-red-600">{deleteMessage}</p>
      )}
    </div>
  );
}
