"use client";

import { useCallback, useEffect, useState } from "react";
import { PhotoUploadField } from "./PhotoUploadField";
import { isLocalUploadPhotoUrl } from "@/lib/photo-url";
import { ServiceEditor, type ServiceRow } from "./ServiceEditor";
import { ServicePriceRulesEditor } from "./ServicePriceRulesEditor";
import { ServiceDurationSettings } from "./ServiceDurationSettings";
import {
  hydratePriceRules,
  mapPriceRuleToApi,
} from "@/lib/price-rules";
import {
  normalizeAllowedDurationsForSlot,
  parseAllowedDurations,
} from "@/lib/service-durations";
import {
  StaffResourceEditor,
} from "./StaffResourceEditor";
import {
  RentalItemsEditor,
  type RentalItemRow,
} from "./RentalItemsEditor";
import {
  availableServiceKinds,
  catalogServices,
  isLegacyTariffService,
  staffExclusiveToCustomService,
  type PresetServiceKind,
} from "@/lib/admin/service-catalog";
import {
  isLegacyTimeSlotStaff,
} from "@/lib/admin/staff-catalog";
import {
  buildStaffSchedulesFromService,
} from "@/lib/admin/service-staff-schedule";
import { ShiftChecklistEditor } from "./shift/ShiftChecklistEditor";

type ScheduleRow = {
  weekday: number;
  isWorking: boolean;
  timeFrom: string;
  timeTo: string;
};

type StaffRow = {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  photoUrl: string | null;
  isActive: boolean;
  isVisible: boolean;
  sortOrder: number;
  schedules: ScheduleRow[];
};

type BranchDetail = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  description: string | null;
  photoUrl: string | null;
  isActive: boolean;
  staff: StaffRow[];
  services: ServiceRow[];
  rentalItems?: RentalItemRow[];
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

type Props = {
  branchId: string;
};

export function BranchEditor({ branchId }: Props) {
  const [branch, setBranch] = useState<BranchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [branchMsg, setBranchMsg] = useState("");
  const [branchSaving, setBranchSaving] = useState(false);
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const [serviceMsg, setServiceMsg] = useState<Record<string, string>>({});
  const [serviceDeleteMsg, setServiceDeleteMsg] = useState<Record<string, string>>({});
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  const [staffMsg, setStaffMsg] = useState<Record<string, string>>({});
  const [staffDeleteMsg, setStaffDeleteMsg] = useState<Record<string, string>>({});
  const [deletingStaffId, setDeletingStaffId] = useState<string | null>(null);
  const [addMsg, setAddMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch(`/api/admin/branches/${branchId}`)
      .then((r) => r.json())
      .then(async (d) => {
        if (!d.branch) throw new Error(d.error ?? "Не удалось загрузить");
        const legacyServices = (d.branch.services as ServiceRow[]).filter(
          isLegacyTariffService,
        );
        const legacyStaff = (d.branch.staff as StaffRow[]).filter(
          isLegacyTimeSlotStaff,
        );
        if (legacyServices.length > 0 || legacyStaff.length > 0) {
          await Promise.all([
            ...legacyServices.map((s) =>
              fetch(`/api/admin/services/${s.id}`, { method: "DELETE" }),
            ),
            ...legacyStaff.map(async (s) => {
              const res = await fetch(`/api/admin/staff/${s.id}`, {
                method: "DELETE",
              });
              if (res.status === 409) {
                await fetch(`/api/admin/staff/${s.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ isActive: false, isVisible: false }),
                });
              }
            }),
          ]);
          const refreshed = await fetch(`/api/admin/branches/${branchId}`).then((r) =>
            r.json(),
          );
          if (!refreshed.branch) throw new Error("Не удалось обновить филиал");
          setBranch({
            ...refreshed.branch,
            services: (refreshed.branch.services as ServiceRow[]).map((s) => ({
              ...s,
              priceRules: hydratePriceRules(s.priceRules),
            })),
          });
          return;
        }
        setBranch({
          ...d.branch,
          services: (d.branch.services as ServiceRow[]).map((s) => ({
            ...s,
            priceRules: hydratePriceRules(s.priceRules),
          })),
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!branch?.services.length) {
      setActiveServiceId(null);
      return;
    }
    const items = catalogServices(branch.services);
    setActiveServiceId((current) => {
      if (current && items.some((s) => s.id === current)) return current;
      return items[0]?.id ?? null;
    });
  }, [branch?.services]);

  async function saveBranch() {
    if (!branch) return;
    setBranchSaving(true);
    setBranchMsg("");
    const res = await fetch(`/api/admin/branches?id=${branchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: branch.name,
        address: branch.address ?? "",
        phone: branch.phone ?? "",
        description: branch.description ?? "",
        photoUrl: branch.photoUrl,
        isActive: branch.isActive,
      }),
    });
    setBranchSaving(false);
    setBranchMsg(res.ok ? "Филиал сохранён" : "Ошибка сохранения");
  }

  async function saveBranchPhoto(photoUrl: string | null) {
    if (!branch) return;
    setBranchSaving(true);
    setBranchMsg("");
    const res = await fetch(`/api/admin/branches?id=${branchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoUrl }),
    });
    setBranchSaving(false);
    if (res.ok) {
      setBranchMsg("Фото сохранено");
    } else {
      const data = await res.json().catch(() => ({}));
      setBranchMsg(
        typeof data.error === "string" ? data.error : "Ошибка сохранения фото",
      );
    }
  }

  function updateBranch(patch: Partial<BranchDetail>) {
    setBranch((b) => (b ? { ...b, ...patch } : b));
  }

  function formatServiceSaveError(data: unknown): string {
    if (!data || typeof data !== "object" || !("error" in data)) {
      return "Ошибка сохранения";
    }
    const error = (data as { error: unknown }).error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object") {
      const flat = error as {
        formErrors?: string[];
        fieldErrors?: Record<string, string[]>;
      };
      const fieldMsg = Object.values(flat.fieldErrors ?? {})
        .flat()
        .find(Boolean);
      if (fieldMsg) return fieldMsg;
      if (flat.formErrors?.[0]) return flat.formErrors[0];
    }
    return "Проверьте заполнение полей";
  }

  async function saveSupServiceSettings(service: ServiceRow) {
    setServiceMsg((m) => ({ ...m, [service.id]: "" }));
    let res: Response;
    let data: unknown;
    try {
      res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationMinutes: service.durationMinutes,
          allowedDurations: service.allowedDurations,
          price: service.price,
          priceRules: service.priceRules?.map((r) =>
            mapPriceRuleToApi(r, service.durationMinutes),
          ),
        }),
      });
      data = await res.json();
    } catch {
      setServiceMsg((m) => ({ ...m, [service.id]: "Ошибка сети" }));
      return;
    }
    setServiceMsg((m) => ({
      ...m,
      [service.id]: res.ok
        ? "Сохранено"
        : formatServiceSaveError(data),
    }));
    if (res.ok && data && typeof data === "object" && "service" in data) {
      const payload = data as { service: ServiceRow };
      setBranch((b) => {
        if (!b) return b;
        const merged = {
          ...service,
          ...payload.service,
          staff: payload.service.staff ?? service.staff,
          priceRules:
            hydratePriceRules(payload.service.priceRules) ?? service.priceRules,
        };
        return {
          ...b,
          services: b.services.map((s) => (s.id === service.id ? merged : s)),
        };
      });
    }
  }

  async function saveService(service: ServiceRow) {
    setServiceMsg((m) => ({ ...m, [service.id]: "" }));
    let res: Response;
    let data: unknown;
    try {
      res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: service.name,
          description: service.description,
          resourceLabel: service.resourceLabel ?? null,
          price: service.price,
          durationMinutes: service.durationMinutes,
          allowedDurations: service.allowedDurations,
          bookableFrom: service.bookableFrom,
          bookableTo: service.bookableTo,
          weekdays: service.weekdays,
          isActive: service.isActive,
          isOnlineBookable: service.isOnlineBookable,
          staffIds: service.staff.map((x) => x.staff.id),
          priceRules: service.priceRules?.map((r) =>
            mapPriceRuleToApi(r, service.durationMinutes),
          ),
        }),
      });
      data = await res.json();
    } catch {
      setServiceMsg((m) => ({ ...m, [service.id]: "Ошибка сети" }));
      return;
    }
    setServiceMsg((m) => ({
      ...m,
      [service.id]: res.ok ? "Сохранено" : formatServiceSaveError(data),
    }));
    if (res.ok && data && typeof data === "object" && "service" in data) {
      const payload = data as { service: ServiceRow };
      setBranch((b) => {
        if (!b) return b;
        const merged = {
          ...service,
          ...payload.service,
          staff: payload.service.staff,
          priceRules:
            hydratePriceRules(payload.service.priceRules) ?? service.priceRules,
        };
        return {
          ...b,
          staff: applyServiceScheduleToLinkedStaff(b.staff, merged),
          services: b.services.map((s) =>
            s.id === service.id ? { ...s, ...payload.service, staff: payload.service.staff } : s,
          ),
        };
      });
    }
  }

  function applyServiceScheduleToLinkedStaff(
    staff: StaffRow[],
    service: ServiceRow,
    staffIds?: Set<string>,
  ): StaffRow[] {
    const linkedIds =
      staffIds ?? new Set(service.staff.map((x) => x.staff.id));
    if (linkedIds.size === 0) return staff;
    const schedules = buildStaffSchedulesFromService(
      service.weekdays,
      service.bookableFrom,
      service.bookableTo,
    );
    return staff.map((st) =>
      linkedIds.has(st.id) ? { ...st, schedules } : st,
    );
  }

  function updateService(id: string, patch: Partial<ServiceRow>) {
    setBranch((b) => {
      if (!b) return b;
      const current = b.services.find((s) => s.id === id);
      if (!current) return b;
      const updated = { ...current, ...patch };
      const scheduleTouched =
        patch.weekdays !== undefined ||
        patch.bookableFrom !== undefined ||
        patch.bookableTo !== undefined;
      return {
        ...b,
        staff: scheduleTouched
          ? applyServiceScheduleToLinkedStaff(b.staff, updated)
          : b.staff,
        services: b.services.map((s) => (s.id === id ? updated : s)),
      };
    });
  }

  function toggleServiceStaff(serviceId: string, staffId: string) {
    setBranch((b) => {
      if (!b) return b;
      const service = b.services.find((s) => s.id === serviceId);
      if (!service) return b;
      const has = service.staff.some((x) => x.staff.id === staffId);
      const staff = has
        ? service.staff.filter((x) => x.staff.id !== staffId)
        : [
            ...service.staff,
            {
              staff: {
                id: staffId,
                name: b.staff.find((st) => st.id === staffId)?.name ?? "",
              },
            },
          ];
      const updatedService = { ...service, staff };
      const branchStaff = !has
        ? applyServiceScheduleToLinkedStaff(b.staff, updatedService, new Set([staffId]))
        : b.staff;
      return {
        ...b,
        staff: branchStaff,
        services: b.services.map((s) =>
          s.id === serviceId ? updatedService : s,
        ),
      };
    });
  }

  async function saveStaffMeta(staff: StaffRow) {
    setStaffMsg((m) => ({ ...m, [staff.id]: "" }));
    const res = await fetch(`/api/admin/staff/${staff.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: staff.name,
        description: staff.description,
        photoUrl: staff.photoUrl,
        kind: staff.kind,
        isActive: staff.isActive,
        isVisible: staff.isVisible,
      }),
    });
    setStaffMsg((m) => ({
      ...m,
      [staff.id]: res.ok ? "Сохранено" : "Ошибка",
    }));
  }

  function updateStaff(id: string, patch: Partial<StaffRow>) {
    setBranch((b) => {
      if (!b) return b;
      return {
        ...b,
        staff: b.staff.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      };
    });
  }

  async function deleteStaff(staff: StaffRow) {
    if (
      !window.confirm(
        `Удалить «${staff.name}»? Это действие нельзя отменить.`,
      )
    ) {
      return;
    }
    setDeletingStaffId(staff.id);
    setStaffDeleteMsg((m) => ({ ...m, [staff.id]: "" }));
    const res = await fetch(`/api/admin/staff/${staff.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setDeletingStaffId(null);
    if (!res.ok) {
      setStaffDeleteMsg((m) => ({
        ...m,
        [staff.id]:
          typeof data.error === "string"
            ? data.error
            : "Не удалось удалить ресурс",
      }));
      return;
    }
    setStaffDeleteMsg((m) => ({ ...m, [staff.id]: "" }));
    setAddMsg(`«${staff.name}» удалён`);
    if (expandedStaff === staff.id) {
      setExpandedStaff(null);
    }
    load();
  }

  async function deleteService(service: ServiceRow) {
    if (
      !window.confirm(
        `Удалить услугу «${service.name}»? Это действие нельзя отменить.`,
      )
    ) {
      return;
    }
    setDeletingServiceId(service.id);
    setServiceDeleteMsg((m) => ({ ...m, [service.id]: "" }));
    const res = await fetch(`/api/admin/services/${service.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setDeletingServiceId(null);
    if (!res.ok) {
      setServiceDeleteMsg((m) => ({
        ...m,
        [service.id]:
          typeof data.error === "string"
            ? data.error
            : "Не удалось удалить услугу",
      }));
      return;
    }
    setServiceDeleteMsg((m) => ({ ...m, [service.id]: "" }));
    setAddMsg(`Услуга «${service.name}» удалена`);
    if (activeServiceId === service.id) {
      setActiveServiceId(null);
    }
    load();
  }

  async function addStaff(kind: "revers" | "sup", serviceId?: string) {
    setAdding(true);
    setAddMsg("");
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId, kind, serviceId }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) {
      setAddMsg(data.error ?? "Не удалось добавить ресурс");
      return;
    }
    setAddMsg(
      serviceId
        ? "Ресурс добавлен"
        : kind === "revers"
          ? "Реверс добавлен"
          : "Сапборд добавлен",
    );
    load();
    if (data.staff?.id) setExpandedStaff(data.staff.id);
  }

  async function addService(kind: PresetServiceKind) {
    setAdding(true);
    setAddMsg("");
    const res = await fetch("/api/admin/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId, kind }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) {
      setAddMsg(typeof data.error === "string" ? data.error : "Не удалось добавить услугу");
      return;
    }
    setAddMsg(kind === "wake" ? "Услуга вейка добавлена" : "Услуга сапов добавлена");
    load();
    if (data.service?.id) setActiveServiceId(data.service.id);
  }

  async function addCustomService(name: string) {
    setAdding(true);
    setAddMsg("");
    const res = await fetch("/api/admin/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId, kind: "custom", name }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) {
      setAddMsg(typeof data.error === "string" ? data.error : "Не удалось добавить услугу");
      return;
    }
    setNewServiceName("");
    setAddServiceOpen(false);
    setAddMsg(`Услуга «${name}» создана`);
    load();
    if (data.service?.id) setActiveServiceId(data.service.id);
  }

  const catalog = branch ? catalogServices(branch.services) : [];
  const sortedCatalog = [...catalog].sort((a, b) => {
    const kindOrder: Record<string, number> = { wake: 0, sup: 1, custom: 2 };
    const ao = a.kind != null ? (kindOrder[a.kind] ?? 9) : 9;
    const bo = b.kind != null ? (kindOrder[b.kind] ?? 9) : 9;
    return ao - bo || a.name.localeCompare(b.name, "ru");
  });
  const addableServiceKinds = branch ? availableServiceKinds(branch.services) : [];
  const activeService =
    sortedCatalog.find((s) => s.id === activeServiceId) ?? null;
  const supService =
    sortedCatalog.find((s) => s.kind === "sup") ?? null;

  if (loading) return <p className="text-slate-500">Загрузка…</p>;
  if (error || !branch) {
    return (
      <p className="text-red-600">{error || "Филиал не найден"}</p>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">О филиале</h2>
        <p className="mt-1 text-xs text-slate-500">
          Название и подпись отображаются поверх фото в виджете записи
        </p>

        <div className="mt-4 space-y-4">
          <PhotoUploadField
            label="Фото филиала"
            kind="branch"
            value={branch.photoUrl}
            onChange={(url) => {
              updateBranch({ photoUrl: url });
              void saveBranchPhoto(url);
            }}
            title={branch.name}
            subtitle={branch.description || branch.address}
            previewAlways
            previewWide
            previewSize="large"
          />
          {isLocalUploadPhotoUrl(branch.photoUrl) && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Фото сохранено только на этом компьютере (локальный путь). Загрузите
              фото ещё раз на production — в БД появится ссылка Supabase, и картинка
              будет видна в виджете на сайте.
            </p>
          )}

          <div className="grid max-w-xl gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">
                Название на карточке
              </span>
              <input
                className={inputClass}
                value={branch.name}
                onChange={(e) => updateBranch({ name: e.target.value })}
                placeholder='Вейкпарк "Раубичи"'
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">
                Подпись на фото
              </span>
              <input
                className={inputClass}
                value={branch.description ?? ""}
                onChange={(e) => updateBranch({ description: e.target.value })}
                placeholder="Спот открыт, записывайтесь!"
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                Белый текст под названием. Если пусто — показывается адрес.
              </span>
            </label>
          </div>

          <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Адрес</span>
              <input
                className={inputClass}
                value={branch.address ?? ""}
                onChange={(e) => updateBranch({ address: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Телефон</span>
              <input
                className={inputClass}
                value={branch.phone ?? ""}
                onChange={(e) => updateBranch({ phone: e.target.value })}
              />
            </label>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={branch.isActive}
              onChange={(e) => updateBranch({ isActive: e.target.checked })}
            />
            <span className="text-sm text-slate-700">Филиал открыт для записи</span>
          </label>
        </div>
        <button
          type="button"
          onClick={saveBranch}
          disabled={branchSaving}
          className="mt-4 rounded-lg bg-lime-600 px-4 py-2 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50"
        >
          {branchSaving ? "Сохранение…" : "Сохранить филиал"}
        </button>
        {branchMsg && <p className="mt-2 text-sm text-slate-600">{branchMsg}</p>}
      </section>

      <RentalItemsEditor
        branchId={branchId}
        items={branch.rentalItems ?? []}
        onSaved={(items) =>
          setBranch((prev) => (prev ? { ...prev, rentalItems: items } : prev))
        }
      />

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Услуги</h2>
        <p className="mt-1 text-xs text-slate-500">
          Выберите услугу — настройте время работы и тарифы как в журнале записей
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {sortedCatalog.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => {
                setActiveServiceId(service.id);
                setAddServiceOpen(false);
              }}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                activeServiceId === service.id
                  ? "border-lime-600 bg-lime-50 text-lime-800"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {service.name}
              {!service.isActive && (
                <span className="ml-1 text-xs font-normal text-slate-400">(выкл.)</span>
              )}
            </button>
          ))}
          <div className="relative">
            <button
              type="button"
              disabled={adding}
              title="Добавить услугу"
              onClick={() => setAddServiceOpen((v) => !v)}
              className="rounded-lg border border-dashed border-lime-600 px-3 py-2 text-sm font-medium text-lime-800 hover:bg-lime-50 disabled:opacity-50"
            >
              + Добавить услугу
            </button>
            {addServiceOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 min-w-[14rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {addableServiceKinds.map((option) => (
                  <button
                    key={option.kind}
                    type="button"
                    disabled={adding}
                    onClick={() => {
                      setAddServiceOpen(false);
                      void addService(option.kind);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {option.label}
                  </button>
                ))}
                {(addableServiceKinds.length > 0) && (
                  <div className="my-1 border-t border-slate-100" />
                )}
                <div className="px-3 py-2">
                  <p className="text-xs font-medium text-slate-600">Новая услуга</p>
                  <input
                    className={`${inputClass} mt-1.5`}
                    value={newServiceName}
                    placeholder="Название"
                    onChange={(e) => setNewServiceName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newServiceName.trim()) {
                        e.preventDefault();
                        void addCustomService(newServiceName.trim());
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={adding || !newServiceName.trim()}
                    onClick={() => void addCustomService(newServiceName.trim())}
                    className="mt-2 w-full rounded-lg bg-lime-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50"
                  >
                    Создать
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {addMsg && <p className="mt-2 text-xs text-slate-600">{addMsg}</p>}
        {activeService ? (
          <div className="mt-4">
            <ServiceEditor
              service={activeService}
              staff={branch.staff}
              branchStaff={branch.staff}
              expandedStaffId={expandedStaff}
              onExpandStaff={setExpandedStaff}
              onUpdateStaff={updateStaff}
              onSaveStaff={(st) => void saveStaffMeta(st as StaffRow)}
              onDeleteStaff={(st) => void deleteStaff(st as StaffRow)}
              onAddResource={() =>
                void addStaff("revers", activeService.id)
              }
              staffSaveMessage={staffMsg}
              staffDeleteMessage={staffDeleteMsg}
              deletingStaffId={deletingStaffId}
              addingResource={adding}
              onUpdate={(patch) => updateService(activeService.id, patch)}
              onToggleStaff={(staffId) =>
                toggleServiceStaff(activeService.id, staffId)
              }
              onSave={() => void saveService(activeService)}
              onDelete={() => void deleteService(activeService)}
              deleting={deletingServiceId === activeService.id}
              saveMessage={serviceMsg[activeService.id]}
              deleteMessage={serviceDeleteMsg[activeService.id]}
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Добавьте услугу вейка или сапов для настройки филиала.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Реверсы</h2>
        <p className="mt-1 text-xs text-slate-500">
          Название, подпись и фото показываются в виджете на шаге «Реверс»
        </p>
        <div className="mt-4 space-y-3">
          {branch.staff
            .filter((st) => st.kind === "revers")
            .filter((st) => !isLegacyTimeSlotStaff(st))
            .filter(
              (st) =>
                !staffExclusiveToCustomService(st.id, branch.services),
            )
            .map((st) => (
              <StaffResourceEditor
                key={st.id}
                staff={st}
                schedules={st.schedules}
                open={expandedStaff === st.id}
                onToggle={() =>
                  setExpandedStaff(expandedStaff === st.id ? null : st.id)
                }
                descriptionLabel="Подпись в виджете"
                photoLabel="Фото реверса"
                onUpdate={(patch) => updateStaff(st.id, patch)}
                onSave={() => void saveStaffMeta(st)}
                onDelete={() => void deleteStaff(st)}
                deleting={deletingStaffId === st.id}
                saveMessage={staffMsg[st.id]}
                deleteMessage={staffDeleteMsg[st.id]}
              />
            ))}
          <button
            type="button"
            disabled={adding}
            onClick={() => void addStaff("revers")}
            className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-lime-500 hover:text-lime-800 disabled:opacity-50"
          >
            + Добавить реверс
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Сапборды</h2>
        <p className="mt-1 text-xs text-slate-500">
          Колонки в журнале и слоты для записи на сапы
        </p>
        {supService ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">
              Тарифы для услуги «{supService.name}» — применяются ко всем сапбордам филиала
            </p>
            <ServiceDurationSettings
              compact
              durationMinutes={supService.durationMinutes}
              allowedDurations={supService.allowedDurations}
              onDurationMinutesChange={(durationMinutes) =>
                updateService(supService.id, {
                  durationMinutes,
                  allowedDurations: normalizeAllowedDurationsForSlot(
                    supService.allowedDurations,
                    durationMinutes,
                  ),
                })
              }
              onAllowedDurationsChange={(allowedDurations) =>
                updateService(supService.id, { allowedDurations })
              }
            />
            <ServicePriceRulesEditor
              embedded
              priceRules={supService.priceRules ?? []}
              basePrice={supService.price}
              durationMinutes={supService.durationMinutes}
              bookingDurations={parseAllowedDurations(supService.allowedDurations)}
              bookableFrom={supService.bookableFrom}
              bookableTo={supService.bookableTo}
              serviceWeekdays={supService.weekdays}
              onChange={(priceRules) => updateService(supService.id, { priceRules })}
            />
            <button
              type="button"
              onClick={() => void saveSupServiceSettings(supService)}
              className="mt-4 rounded-lg bg-lime-600 px-4 py-2 text-sm font-medium text-white hover:bg-lime-700"
            >
              Сохранить тарифы
            </button>
            {serviceMsg[supService.id] && (
              <p className="mt-2 text-xs text-slate-500">{serviceMsg[supService.id]}</p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            Добавьте услугу «Сапборд» в блоке «Услуги», чтобы настроить тарифы.
          </p>
        )}
        <div className="mt-4 space-y-3">
          {branch.staff
            .filter((st) => st.kind === "sup")
            .filter((st) => !isLegacyTimeSlotStaff(st))
            .map((st) => (
              <StaffResourceEditor
                key={st.id}
                staff={st}
                schedules={st.schedules}
                open={expandedStaff === st.id}
                onToggle={() =>
                  setExpandedStaff(expandedStaff === st.id ? null : st.id)
                }
                descriptionLabel="Описание"
                photoLabel="Фото"
                onUpdate={(patch) => updateStaff(st.id, patch)}
                onSave={() => void saveStaffMeta(st)}
                onDelete={() => void deleteStaff(st)}
                deleting={deletingStaffId === st.id}
                saveMessage={staffMsg[st.id]}
                deleteMessage={staffDeleteMsg[st.id]}
              />
            ))}
          <button
            type="button"
            disabled={adding}
            onClick={() => void addStaff("sup")}
            className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-lime-500 hover:text-lime-800 disabled:opacity-50"
          >
            + Добавить сапборд
          </button>
        </div>
      </section>

      <ShiftChecklistEditor branchId={branchId} />
    </div>
  );
}
