"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateKey, formatDateMinsk, formatTimeMinsk } from "@/lib/time";

type LogItem = {
  id: string;
  createdAt: string;
  action: string;
  actionLabel: string;
  actorName: string;
  branchName: string | null;
  summary: string;
};

type Branch = { id: string; name: string };

const PERIOD_DAYS = [
  { label: "7 дней", days: 7 },
  { label: "30 дней", days: 30 },
  { label: "90 дней", days: 90 },
];

const ACTION_FILTERS = [
  { value: "", label: "Все действия" },
  { value: "appointments", label: "Только записи" },
  { value: "login", label: "Вход" },
  { value: "logout", label: "Выход" },
  { value: "appt.create", label: "Создал запись" },
  { value: "appt.update", label: "Изменил запись" },
  { value: "appt.cancel", label: "Удалил запись" },
  { value: "shift.open", label: "Открытие смены" },
  { value: "shift.close", label: "Закрытие смены" },
  { value: "user.change", label: "Сотрудники" },
];

function dateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days + 1);
  return formatDateKey(d);
}

function formatLogTime(iso: string): string {
  return `${formatDateMinsk(iso, "")} ${formatTimeMinsk(iso)}`.trim();
}

function actionBadgeClass(action: string): string {
  if (action === "appt.create") return "bg-green-100 text-green-800";
  if (action === "appt.update") return "bg-blue-100 text-blue-800";
  if (action === "appt.cancel") return "bg-red-100 text-red-800";
  if (action === "appt.create.online") return "bg-slate-100 text-slate-600";
  if (action.startsWith("shift.")) return "bg-emerald-100 text-emerald-800";
  if (action.startsWith("schedule.")) return "bg-amber-100 text-amber-900";
  if (action === "user.change") return "bg-violet-100 text-violet-800";
  if (action === "login" || action === "logout") return "bg-slate-100 text-slate-600";
  return "bg-slate-100 text-slate-700";
}

const inputClass =
  "min-h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const btnSecondary =
  "min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium";

export function ActivityLogPage() {
  const [mounted, setMounted] = useState(false);
  const [periodDays, setPeriodDays] = useState(7);
  const [branchId, setBranchId] = useState("");
  const [action, setAction] = useState("");
  const [query, setQuery] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [items, setItems] = useState<LogItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    void fetch("/api/admin/branches")
      .then((r) => r.json())
      .then((d) => {
        if (d.branches) setBranches(d.branches);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(
    async (append: boolean, cursorId?: string | null) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError("");
      try {
        const q = new URLSearchParams({
          from: dateDaysAgo(periodDays),
          to: formatDateKey(new Date()),
        });
        if (branchId) q.set("branchId", branchId);
        if (action) q.set("action", action);
        if (query.trim()) q.set("q", query.trim());
        if (append && cursorId) q.set("cursor", cursorId);

        const r = await fetch(`/api/admin/activity-log?${q}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Ошибка загрузки");

        if (append) {
          setItems((prev) => [...prev, ...(d.items ?? [])]);
        } else {
          setItems(d.items ?? []);
        }
        setNextCursor(d.nextCursor ?? null);
        setCursor(d.nextCursor ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [periodDays, branchId, action, query],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Журнал логов</h1>
        <p className="mt-1 text-sm text-slate-500">
          Входы, записи и основные изменения за последние 90 дней
        </p>
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {PERIOD_DAYS.map((p) => (
          <button
            key={p.days}
            type="button"
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              periodDays === p.days
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600"
            }`}
            onClick={() => setPeriodDays(p.days)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select
          className={inputClass}
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
        >
          <option value="">Все филиалы</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          {ACTION_FILTERS.map((f) => (
            <option key={f.value || "all"} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <input
          className={`${inputClass} sm:col-span-2`}
          placeholder="Поиск: #8331, имя сотрудника…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void load(false);
          }}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {!mounted || loading ? (
        <p className="text-sm text-slate-500">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">Записей не найдено</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-3 py-2">Время</th>
                  <th className="px-3 py-2">Сотрудник</th>
                  <th className="px-3 py-2">Филиал</th>
                  <th className="px-3 py-2">Действие</th>
                  <th className="px-3 py-2">Описание</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                      {formatLogTime(row.createdAt)}
                    </td>
                    <td className="px-3 py-2">{row.actorName}</td>
                    <td className="px-3 py-2 text-slate-600">{row.branchName ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${actionBadgeClass(row.action)}`}
                      >
                        {row.actionLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{row.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 md:hidden">
            {items.map((row) => (
              <li key={row.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">{formatLogTime(row.createdAt)}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${actionBadgeClass(row.action)}`}
                  >
                    {row.actionLabel}
                  </span>
                </div>
                <div className="mt-1 font-medium text-slate-900">{row.actorName}</div>
                {row.branchName && (
                  <div className="text-xs text-slate-500">{row.branchName}</div>
                )}
                <div className="mt-1 text-slate-700">{row.summary}</div>
              </li>
            ))}
          </ul>

          {nextCursor && (
            <button
              type="button"
              className={btnSecondary}
              disabled={loadingMore}
              onClick={() => void load(true, cursor)}
            >
              {loadingMore ? "…" : "Загрузить ещё"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
