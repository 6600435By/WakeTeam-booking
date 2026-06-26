"use client";

import { useCallback, useEffect, useState } from "react";
import { ScheduleEditor } from "./ScheduleEditor";
import { PhotoUploadField } from "./PhotoUploadField";

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

type PriceRuleRow = {
  id: string;
  weekdays: string;
  timeFrom: string;
  timeTo: string;
  price: number;
  sortOrder: number;
};

type ServiceRow = {
  id: string;
  name: string;
  kind?: string;
  description: string | null;
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
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function parseWeekdays(s: string): Set<number> {
  return new Set(
    s
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !Number.isNaN(n)),
  );
}

function formatWeekdays(set: Set<number>): string {
  return [...set].sort((a, b) => a - b).join(",");
}

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
  const [staffMsg, setStaffMsg] = useState<Record<string, string>>({});
  const [addMsg, setAddMsg] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch(`/api/admin/branches/${branchId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.branch) throw new Error(d.error ?? "Не удалось загрузить");
        setBranch(d.branch);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

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

  function updateBranch(patch: Partial<BranchDetail>) {
    setBranch((b) => (b ? { ...b, ...patch } : b));
  }

  async function saveService(service: ServiceRow) {
    setServiceMsg((m) => ({ ...m, [service.id]: "" }));
    const res = await fetch(`/api/admin/services/${service.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: service.name,
        description: service.description,
        price: service.price,
        durationMinutes: service.durationMinutes,
        allowedDurations: service.allowedDurations,
        bookableFrom: service.bookableFrom,
        bookableTo: service.bookableTo,
        weekdays: service.weekdays,
        isActive: service.isActive,
        isOnlineBookable: service.isOnlineBookable,
        staffIds: service.staff.map((x) => x.staff.id),
        priceRules: service.priceRules?.map((r) => ({
          weekdays: r.weekdays,
          timeFrom: r.timeFrom,
          timeTo: r.timeTo,
          price: r.price,
          sortOrder: r.sortOrder,
        })),
      }),
    });
    const data = await res.json();
    setServiceMsg((m) => ({
      ...m,
      [service.id]: res.ok ? "Сохранено" : data.error ?? "Ошибка",
    }));
    if (res.ok && data.service) {
      setBranch((b) => {
        if (!b) return b;
        return {
          ...b,
          services: b.services.map((s) =>
            s.id === service.id ? { ...s, ...data.service, staff: data.service.staff } : s,
          ),
        };
      });
    }
  }

  function updateService(id: string, patch: Partial<ServiceRow>) {
    setBranch((b) => {
      if (!b) return b;
      return {
        ...b,
        services: b.services.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      };
    });
  }

  function toggleServiceStaff(serviceId: string, staffId: string) {
    setBranch((b) => {
      if (!b) return b;
      return {
        ...b,
        services: b.services.map((s) => {
          if (s.id !== serviceId) return s;
          const has = s.staff.some((x) => x.staff.id === staffId);
          const staff = has
            ? s.staff.filter((x) => x.staff.id !== staffId)
            : [
                ...s.staff,
                {
                  staff: {
                    id: staffId,
                    name: b.staff.find((st) => st.id === staffId)?.name ?? "",
                  },
                },
              ];
          return { ...s, staff };
        }),
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

  async function addStaff(kind: "revers" | "sup") {
    setAdding(true);
    setAddMsg("");
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId, kind }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) {
      setAddMsg(data.error ?? "Не удалось добавить ресурс");
      return;
    }
    setAddMsg(kind === "revers" ? "Реверс добавлен" : "Сапборд добавлен");
    load();
    if (data.staff?.id) setExpandedStaff(data.staff.id);
  }

  async function addService(kind: "wake" | "sup") {
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
  }

  const hasWakeService = branch?.services.some(
    (s) => s.kind === "wake" && s.isActive,
  );
  const hasSupService = branch?.services.some(
    (s) => s.kind === "sup" && s.isActive,
  );

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
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-slate-500">Название</span>
            <input
              className={inputClass}
              value={branch.name}
              onChange={(e) => updateBranch({ name: e.target.value })}
            />
          </label>
          <label className="block sm:col-span-2">
            <PhotoUploadField
              label="Фото филиала"
              kind="branch"
              value={branch.photoUrl}
              onChange={(url) => updateBranch({ photoUrl: url })}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-slate-500">Описание</span>
            <textarea
              className={`${inputClass} min-h-[80px]`}
              value={branch.description ?? ""}
              onChange={(e) => updateBranch({ description: e.target.value })}
            />
          </label>
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
          <label className="flex items-center gap-2 sm:col-span-2">
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

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Услуги</h2>
        <p className="mt-1 text-xs text-slate-500">
          Настройки услуг влияют на виджет и журнал записей
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!hasWakeService && (
            <button
              type="button"
              disabled={adding}
              onClick={() => void addService("wake")}
              className="rounded-lg border border-lime-600 px-3 py-1.5 text-sm text-lime-800 hover:bg-lime-50 disabled:opacity-50"
            >
              + Вейкбординг
            </button>
          )}
          {!hasSupService && (
            <button
              type="button"
              disabled={adding}
              onClick={() => void addService("sup")}
              className="rounded-lg border border-lime-600 px-3 py-1.5 text-sm text-lime-800 hover:bg-lime-50 disabled:opacity-50"
            >
              + Сапборд
            </button>
          )}
        </div>
        {addMsg && <p className="mt-2 text-xs text-slate-600">{addMsg}</p>}
        <div className="mt-4 space-y-4">
          {branch.services.map((service) => {
            const wd = parseWeekdays(service.weekdays);
            return (
              <div
                key={service.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <input
                    className={`${inputClass} max-w-md font-semibold`}
                    value={service.name}
                    onChange={(e) =>
                      updateService(service.id, { name: e.target.value })
                    }
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={service.isActive}
                      onChange={(e) =>
                        updateService(service.id, { isActive: e.target.checked })
                      }
                    />
                    Активна
                  </label>
                </div>
                <textarea
                  className={`${inputClass} mt-2 min-h-[60px]`}
                  placeholder="Описание услуги"
                  value={service.description ?? ""}
                  onChange={(e) =>
                    updateService(service.id, { description: e.target.value })
                  }
                />
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Цена, Br</span>
                    <input
                      type="number"
                      className={inputClass}
                      value={service.price}
                      onChange={(e) =>
                        updateService(service.id, {
                          price: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">
                      Длительности, мин
                    </span>
                    <input
                      className={inputClass}
                      value={service.allowedDurations}
                      onChange={(e) =>
                        updateService(service.id, {
                          allowedDurations: e.target.value,
                        })
                      }
                      placeholder="10,30,60"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">С</span>
                    <input
                      type="time"
                      className={inputClass}
                      value={service.bookableFrom ?? ""}
                      onChange={(e) =>
                        updateService(service.id, {
                          bookableFrom: e.target.value || null,
                        })
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">До</span>
                    <input
                      type="time"
                      className={inputClass}
                      value={service.bookableTo ?? ""}
                      onChange={(e) =>
                        updateService(service.id, {
                          bookableTo: e.target.value || null,
                        })
                      }
                    />
                  </label>
                </div>
                {(service.kind === "wake" || (service.priceRules?.length ?? 0) > 0) && (
                  <div className="mt-3">
                    <span className="text-xs font-medium text-slate-600">Тарифы по времени</span>
                    <div className="mt-2 space-y-2">
                      {(service.priceRules ?? []).map((rule, idx) => (
                        <div
                          key={rule.id || idx}
                          className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 sm:grid-cols-4"
                        >
                          <input
                            className={inputClass}
                            value={rule.weekdays}
                            placeholder="1,2,3,4,5"
                            onChange={(e) => {
                              const rules = [...(service.priceRules ?? [])];
                              rules[idx] = { ...rules[idx], weekdays: e.target.value };
                              updateService(service.id, { priceRules: rules });
                            }}
                          />
                          <input
                            type="time"
                            className={inputClass}
                            value={rule.timeFrom}
                            onChange={(e) => {
                              const rules = [...(service.priceRules ?? [])];
                              rules[idx] = { ...rules[idx], timeFrom: e.target.value };
                              updateService(service.id, { priceRules: rules });
                            }}
                          />
                          <input
                            type="time"
                            className={inputClass}
                            value={rule.timeTo}
                            onChange={(e) => {
                              const rules = [...(service.priceRules ?? [])];
                              rules[idx] = { ...rules[idx], timeTo: e.target.value };
                              updateService(service.id, { priceRules: rules });
                            }}
                          />
                          <input
                            type="number"
                            className={inputClass}
                            value={rule.price}
                            onChange={(e) => {
                              const rules = [...(service.priceRules ?? [])];
                              rules[idx] = {
                                ...rules[idx],
                                price: parseFloat(e.target.value) || 0,
                              };
                              updateService(service.id, { priceRules: rules });
                            }}
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-xs text-lime-700 hover:underline"
                        onClick={() =>
                          updateService(service.id, {
                            priceRules: [
                              ...(service.priceRules ?? []),
                              {
                                id: `new-${Date.now()}`,
                                weekdays: "1,2,3,4,5",
                                timeFrom: "10:00",
                                timeTo: "16:00",
                                price: service.price,
                                sortOrder: (service.priceRules?.length ?? 0) + 1,
                              },
                            ],
                          })
                        }
                      >
                        + Добавить тариф
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-3">
                  <span className="text-xs text-slate-500">Дни недели</span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {WEEKDAY_LABELS.map((label, i) => {
                      const day = i + 1;
                      return (
                        <label
                          key={day}
                          className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={wd.has(day)}
                            onChange={(e) => {
                              const next = new Set(wd);
                              if (e.target.checked) next.add(day);
                              else next.delete(day);
                              updateService(service.id, {
                                weekdays: formatWeekdays(next),
                              });
                            }}
                          />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-xs text-slate-500">Ресурсы для услуги</span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {branch.staff.map((st) => {
                      const checked = service.staff.some((x) => x.staff.id === st.id);
                      return (
                        <label
                          key={st.id}
                          className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleServiceStaff(service.id, st.id)}
                          />
                          {st.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={service.isOnlineBookable}
                    onChange={(e) =>
                      updateService(service.id, {
                        isOnlineBookable: e.target.checked,
                      })
                    }
                  />
                  Доступна в онлайн-виджете
                </label>
                <button
                  type="button"
                  onClick={() => void saveService(service)}
                  className="mt-3 rounded-lg border border-lime-600 px-3 py-1.5 text-sm text-lime-800 hover:bg-lime-50"
                >
                  Сохранить услугу
                </button>
                {serviceMsg[service.id] && (
                  <p className="mt-1 text-xs text-slate-500">{serviceMsg[service.id]}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Реверсы</h2>
        <p className="mt-1 text-xs text-slate-500">
          Название, подпись и фото показываются в виджете на шаге «Реверс»
        </p>
        <div className="mt-4 space-y-3">
          {branch.staff
            .filter((st) => st.kind === "revers")
            .map((st) => (
              <StaffResourceEditor
                key={st.id}
                staff={st}
                open={expandedStaff === st.id}
                onToggle={() =>
                  setExpandedStaff(expandedStaff === st.id ? null : st.id)
                }
                descriptionLabel="Подпись в виджете"
                photoLabel="Фото реверса"
                onUpdate={(patch) => updateStaff(st.id, patch)}
                onSave={() => void saveStaffMeta(st)}
                saveMessage={staffMsg[st.id]}
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
        <div className="mt-4 space-y-3">
          {branch.staff
            .filter((st) => st.kind === "sup")
            .map((st) => (
              <StaffResourceEditor
                key={st.id}
                staff={st}
                open={expandedStaff === st.id}
                onToggle={() =>
                  setExpandedStaff(expandedStaff === st.id ? null : st.id)
                }
                descriptionLabel="Описание"
                photoLabel="Фото"
                onUpdate={(patch) => updateStaff(st.id, patch)}
                onSave={() => void saveStaffMeta(st)}
                saveMessage={staffMsg[st.id]}
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
    </div>
  );
}

function StaffResourceEditor({
  staff,
  open,
  onToggle,
  descriptionLabel,
  photoLabel,
  onUpdate,
  onSave,
  saveMessage,
}: {
  staff: StaffRow;
  open: boolean;
  onToggle: () => void;
  descriptionLabel: string;
  photoLabel: string;
  onUpdate: (patch: Partial<StaffRow>) => void;
  onSave: () => void;
  saveMessage?: string;
}) {
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
              <span className="mb-1 block text-xs text-slate-500">Название</span>
              <input
                className={inputClass}
                value={staff.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-slate-500">
                {descriptionLabel}
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
          <button
            type="button"
            onClick={onSave}
            className="mt-3 rounded-lg border border-lime-600 px-3 py-1.5 text-sm text-lime-800 hover:bg-lime-50"
          >
            Сохранить
          </button>
          {saveMessage && (
            <p className="mt-1 text-xs text-slate-500">{saveMessage}</p>
          )}
          <div className="mt-4">
            <h3 className="text-sm font-medium text-slate-700">Расписание работы</h3>
            <ScheduleEditor staffId={staff.id} embedded />
          </div>
        </div>
      )}
    </div>
  );
}
