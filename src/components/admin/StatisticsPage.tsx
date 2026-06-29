"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatisticsChart } from "./StatisticsChart";
import { StatusBadge } from "./StatusBadge";
import {
  CANCEL_REASON_OPTIONS,
  cancelReasonLabel,
  statusLabel,
} from "@/lib/appointment-status";
import { SOURCE_OPTIONS, sourceLabel } from "@/lib/statistics-constants";
import { PAYMENT_METHOD_OPTIONS, paymentMethodLabel } from "@/lib/payment-method";
import { periodToday, periodWeek, todayDateKey } from "@/lib/date-ranges";

type Branch = { id: string; name: string };
type Staff = { id: string; name: string; branchId: string };
type Service = { id: string; name: string; branchId: string };

type Appointment = {
  id: string;
  publicNumber: number;
  startAt: string;
  createdAt: string;
  status: string;
  price: number;
  durationMinutes: number;
  paymentMethod: string | null;
  comment: string | null;
  cancelReason: string | null;
  source: string;
  branchId: string;
  client: { firstName: string | null; lastName: string | null; phone: string; email: string | null };
  service: { name: string };
  staff: { name: string };
};

type Filters = {
  dateFrom: string;
  dateTo: string;
  createdFrom: string;
  createdTo: string;
  publicNumber: string;
  clientName: string;
  phone: string;
  email: string;
  comment: string;
  status: string;
  branchId: string;
  staffId: string;
  serviceId: string;
  source: string;
  cancelReason: string;
  paymentMethod: string;
};

const ALL_STATUSES = [
  "booked",
  "in_service",
  "completed",
  "awaiting_prepayment",
  "awaiting_confirmation",
  "in_cart",
  "rescheduling",
  "no_show",
  "deleted",
  "cancelled",
];

function defaultDateTo() {
  return todayDateKey();
}

function defaultDateFrom() {
  return periodToday().from;
}

function emptyFilters(): Filters {
  const { from, to } = periodToday();
  return {
    dateFrom: from,
    dateTo: to,
    createdFrom: "",
    createdTo: "",
    publicNumber: "",
    clientName: "",
    phone: "",
    email: "",
    comment: "",
    status: "",
    branchId: "",
    staffId: "",
    serviceId: "",
    source: "",
    cancelReason: "",
    paymentMethod: "",
  };
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

export function StatisticsPage() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState({
    count: 0,
    totalPrice: 0,
    totalDurationMinutes: 0,
  });
  const [series, setSeries] = useState<
    { date: string; count: number; price: number; durationMinutes: number }[]
  >([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(true);
  const [lockedBranchId, setLockedBranchId] = useState<string | null>(null);

  const branchMap = useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches],
  );

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    setError("");
    const q = new URLSearchParams();
    q.set("dateFrom", f.dateFrom);
    q.set("dateTo", f.dateTo);
    if (f.createdFrom && f.createdTo) {
      q.set("createdFrom", f.createdFrom);
      q.set("createdTo", f.createdTo);
    }
    for (const key of [
      "publicNumber",
      "clientName",
      "phone",
      "email",
      "comment",
      "status",
      "branchId",
      "staffId",
      "serviceId",
      "source",
      "cancelReason",
      "paymentMethod",
    ] as const) {
      if (f[key]) q.set(key, f[key]);
    }

    try {
      const res = await fetch(`/api/admin/statistics?${q}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Ошибка загрузки");
      setSummary(d.summary);
      setSeries(d.series ?? []);
      setAppointments(d.appointments ?? []);
      setBranches(d.options?.branches ?? []);
      setStaff(d.options?.staff ?? []);
      setServices(d.options?.services ?? []);
      setIsSuperAdmin(d.options?.isSuperAdmin ?? true);
      setLockedBranchId(d.options?.lockedBranchId ?? null);
      if (!f.branchId && d.options?.lockedBranchId) {
        setDraft((prev) => ({ ...prev, branchId: d.options.lockedBranchId }));
        setFilters((prev) => ({ ...prev, branchId: d.options.lockedBranchId }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  function applyFilters() {
    setFilters({ ...draft });
  }

  function resetFilters() {
    const base = emptyFilters();
    if (lockedBranchId) base.branchId = lockedBranchId;
    setDraft(base);
    setFilters(base);
  }

  function exportCsv() {
    const header = [
      "#",
      "Клиент",
      "Телефон",
      "Статус",
      "Филиал",
      "Услуга",
      "Ресурс",
      "Цена",
      "Длительность",
      "Дата записи",
      "Создана",
      "Источник",
      "Причина",
      "Комментарий",
    ];
    const rows = appointments.map((a) => {
      const name =
        [a.client.firstName, a.client.lastName].filter(Boolean).join(" ") || "—";
      return [
        a.publicNumber,
        name,
        a.client.phone,
        statusLabel(a.status),
        branchMap.get(a.branchId) ?? "—",
        a.service.name,
        a.staff.name,
        a.price,
        a.durationMinutes,
        new Date(a.startAt).toLocaleString("ru-RU", { timeZone: "Europe/Minsk" }),
        new Date(a.createdAt).toLocaleString("ru-RU", { timeZone: "Europe/Minsk" }),
        sourceLabel(a.source),
        cancelReasonLabel(a.cancelReason) || "—",
        a.comment ?? "",
      ];
    });
    const csv = [header, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statistics-${filters.dateFrom}-${filters.dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredStaff = draft.branchId
    ? staff.filter((s) => s.branchId === draft.branchId)
    : staff;
  const filteredServices = draft.branchId
    ? services.filter((s) => s.branchId === draft.branchId)
    : services;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Статистика</h1>
          <p className="mt-1 text-sm text-slate-500">
            Сводка записей, график по дням и детальный список
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={appointments.length === 0}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Экспорт CSV
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-medium text-slate-700 md:hidden"
        >
          Фильтры
          <span>{showFilters ? "▲" : "▼"}</span>
        </button>

        <div className={`${showFilters ? "mt-3 block" : "hidden"} space-y-4 md:block md:mt-0`}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col">
              <span className="text-xs text-slate-500 invisible select-none" aria-hidden="true">
                —
              </span>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const { from, to } = periodToday();
                    setDraft((d) => ({ ...d, dateFrom: from, dateTo: to }));
                    setFilters((f) => ({ ...f, dateFrom: from, dateTo: to }));
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Сегодня
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { from, to } = periodWeek();
                    setDraft((d) => ({ ...d, dateFrom: from, dateTo: to }));
                    setFilters((f) => ({ ...f, dateFrom: from, dateTo: to }));
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Неделя
                </button>
              </div>
            </div>
            <label className="block text-xs text-slate-500">
              Дата записи, от
              <input
                type="date"
                value={draft.dateFrom}
                max={draft.dateTo}
                onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-xs text-slate-500">
              Дата записи, до
              <input
                type="date"
                value={draft.dateTo}
                min={draft.dateFrom}
                onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-xs text-slate-500">
              Дата создания, от
              <input
                type="date"
                value={draft.createdFrom}
                onChange={(e) => setDraft((d) => ({ ...d, createdFrom: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-xs text-slate-500">
              Дата создания, до
              <input
                type="date"
                value={draft.createdTo}
                min={draft.createdFrom || undefined}
                onChange={(e) => setDraft((d) => ({ ...d, createdTo: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs text-slate-500">
              Номер записи
              <input
                value={draft.publicNumber}
                onChange={(e) => setDraft((d) => ({ ...d, publicNumber: e.target.value }))}
                placeholder="#8330001"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-xs text-slate-500">
              ФИО клиента
              <input
                value={draft.clientName}
                onChange={(e) => setDraft((d) => ({ ...d, clientName: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-xs text-slate-500">
              Телефон
              <input
                value={draft.phone}
                onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-xs text-slate-500">
              Email
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs text-slate-500">
              Комментарий
              <input
                value={draft.comment}
                onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-xs text-slate-500">
              Статус
              <select
                value={draft.status}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              >
                <option value="">Все</option>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-500">
              Филиал
              <select
                value={draft.branchId}
                disabled={!isSuperAdmin}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    branchId: e.target.value,
                    staffId: "",
                    serviceId: "",
                  }))
                }
                className={`mt-1 ${inputClass} disabled:bg-slate-100`}
              >
                <option value="">Все</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-500">
              Ресурс
              <select
                value={draft.staffId}
                onChange={(e) => setDraft((d) => ({ ...d, staffId: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              >
                <option value="">Все</option>
                {filteredStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs text-slate-500">
              Услуга
              <select
                value={draft.serviceId}
                onChange={(e) => setDraft((d) => ({ ...d, serviceId: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              >
                <option value="">Все</option>
                {filteredServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-500">
              Кем создана
              <select
                value={draft.source}
                onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              >
                <option value="">Все</option>
                {SOURCE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-500">
              Причина отмены
              <select
                value={draft.cancelReason}
                onChange={(e) => setDraft((d) => ({ ...d, cancelReason: e.target.value }))}
                className={`mt-1 ${inputClass}`}
              >
                <option value="">Все</option>
                {CANCEL_REASON_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-500">
              Оплата
              <select
                value={draft.paymentMethod}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, paymentMethod: e.target.value }))
                }
                className={`mt-1 ${inputClass}`}
              >
                <option value="">Все</option>
                {PAYMENT_METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyFilters}
              className="rounded-lg bg-lime-600 px-5 py-2 text-sm font-medium text-white hover:bg-lime-700"
            >
              Фильтровать
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Сбросить
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Записей</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {loading ? "…" : summary.count}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Стоимость услуг, Br</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {loading ? "…" : Math.round(summary.totalPrice)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Длительность, мин</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {loading ? "…" : summary.totalDurationMinutes}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">График по дням</h2>
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">Загрузка…</p>
        ) : (
          <StatisticsChart series={series} />
        )}
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">
            Записи ({appointments.length}
            {appointments.length >= 1000 ? "+" : ""})
          </h2>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-slate-400">Загрузка…</p>
        ) : appointments.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">Нет записей по выбранным фильтрам</p>
        ) : (
          <>
            <div className="space-y-2 p-3 md:hidden">
              {appointments.map((a) => {
                const name =
                  [a.client.firstName, a.client.lastName].filter(Boolean).join(" ") ||
                  a.client.phone;
                const branchName = branchMap.get(a.branchId) ?? "";
                return (
                  <div
                    key={a.id}
                    className="rounded-lg border border-slate-100 px-3 py-2 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">#{a.publicNumber} · {name}</p>
                        <p className="mt-0.5 text-slate-600">
                          {branchName} · {a.staff.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {new Date(a.startAt).toLocaleString("ru-RU", {
                            timeZone: "Europe/Minsk",
                          })}{" "}
                          · {a.price} Br · {a.durationMinutes} мин
                          {a.paymentMethod && (
                            <span className="text-slate-400">
                              {" "}
                              · {paymentMethodLabel(a.paymentMethod)}
                            </span>
                          )}
                        </p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="px-4 py-2">#</th>
                    <th className="px-2 py-2">Клиент</th>
                    <th className="px-2 py-2">Статус</th>
                    <th className="px-2 py-2">Описание</th>
                    <th className="px-2 py-2">Цена</th>
                    <th className="px-2 py-2">Оплата</th>
                    <th className="px-4 py-2">Дата записи</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((a) => {
                    const name =
                      [a.client.firstName, a.client.lastName].filter(Boolean).join(" ") ||
                      "—";
                    const branchName = branchMap.get(a.branchId) ?? "";
                    return (
                      <tr key={a.id} className="border-b border-slate-50">
                        <td className="px-4 py-2">{a.publicNumber}</td>
                        <td className="px-2 py-2">
                          {name}
                          <br />
                          <span className="text-xs text-slate-500">{a.client.phone}</span>
                        </td>
                        <td className="px-2 py-2">
                          <StatusBadge status={a.status} />
                        </td>
                        <td className="max-w-xs px-2 py-2 text-slate-600">
                          {branchName} · {a.service.name} · {a.staff.name}
                          {a.cancelReason && (
                            <span className="block text-xs text-slate-400">
                              {cancelReasonLabel(a.cancelReason)}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">{a.price} Br</td>
                        <td className="px-2 py-2 text-slate-600">
                          {paymentMethodLabel(a.paymentMethod)}
                        </td>
                        <td className="px-4 py-2">
                          {new Date(a.startAt).toLocaleString("ru-RU", {
                            timeZone: "Europe/Minsk",
                          })}
                          <br />
                          <span className="text-xs text-slate-400">
                            создана{" "}
                            {new Date(a.createdAt).toLocaleString("ru-RU", {
                              timeZone: "Europe/Minsk",
                            })}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Не используются (нет в системе): промокоды, онлайн-оплата, история изменений,
        запросы оповещений.
      </p>
    </div>
  );
}
