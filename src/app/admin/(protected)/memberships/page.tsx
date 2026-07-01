"use client";

import { formatDateMinsk } from "@/lib/time";
import { useCallback, useEffect, useMemo, useState } from "react";

type Membership = {
  id: string;
  externalCode: string;
  category: string | null;
  ownerName: string | null;
  phone: string;
  initialMinutes: number;
  pricePerMinute: number | null;
  sheetRemainingMinutes: number;
  localDeductedMinutes: number;
  effectiveRemainingMinutes: number;
  comment: string | null;
  saleDate: string | null;
  syncedAt: string;
};

type SortKey =
  | "code"
  | "saleDate"
  | "ownerName"
  | "phone"
  | "category"
  | "pricePerMinute"
  | "sheetRemaining"
  | "localDeducted"
  | "available"
  | "syncedAt";

type SortDir = "asc" | "desc";

const SORT_DEFAULT_DESC: SortKey[] = [
  "saleDate",
  "pricePerMinute",
  "sheetRemaining",
  "localDeducted",
  "available",
  "syncedAt",
];

function formatPricePerMinute(value: number | null) {
  if (value == null || value <= 0) return "—";
  return `${value} Br`;
}

function formatSyncedAt(iso: string) {
  return new Date(iso).toLocaleString("ru-RU");
}

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").localeCompare(b ?? "", "ru", { sensitivity: "base" });
}

function compareNumber(a: number, b: number) {
  return a - b;
}

function compareDate(a: string | null, b: string | null) {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return ta - tb;
}

function sortMemberships(
  rows: Membership[],
  key: SortKey,
  dir: SortDir,
): Membership[] {
  const sorted = [...rows];
  const sign = dir === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "code":
        cmp = compareText(a.externalCode, b.externalCode);
        break;
      case "saleDate":
        cmp = compareDate(a.saleDate, b.saleDate);
        break;
      case "ownerName":
        cmp = compareText(a.ownerName, b.ownerName);
        break;
      case "phone":
        cmp = compareText(a.phone, b.phone);
        break;
      case "category":
        cmp = compareText(a.category, b.category);
        break;
      case "pricePerMinute":
        cmp = compareNumber(a.pricePerMinute ?? 0, b.pricePerMinute ?? 0);
        break;
      case "sheetRemaining":
        cmp = compareNumber(a.sheetRemainingMinutes, b.sheetRemainingMinutes);
        break;
      case "localDeducted":
        cmp = compareNumber(a.localDeductedMinutes, b.localDeductedMinutes);
        break;
      case "available":
        cmp = compareNumber(
          a.effectiveRemainingMinutes,
          b.effectiveRemainingMinutes,
        );
        break;
      case "syncedAt":
        cmp = compareDate(a.syncedAt, b.syncedAt);
        break;
    }
    return cmp * sign;
  });

  return sorted;
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex items-center gap-1 text-left font-medium text-slate-500 hover:text-slate-800"
    >
      <span>{label}</span>
      <span
        className={`text-[10px] leading-none ${active ? "text-lime-700" : "text-slate-300 group-hover:text-slate-400"}`}
        aria-hidden
      >
        {active ? (dir === "desc" ? "▼" : "▲") : "↕"}
      </span>
    </button>
  );
}

export default function MembershipsPage() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("saleDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const load = useCallback((query?: string) => {
    setLoading(true);
    const trimmed = query?.trim();
    const q = trimmed ? `?q=${encodeURIComponent(trimmed)}` : "";
    fetch(`/api/admin/memberships${q}`)
      .then((r) => r.json())
      .then((d) => setMemberships(d.memberships ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/admin/memberships/sync")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.lastSyncedAt) setLastSyncedAt(d.lastSyncedAt);
      });
    fetch("/api/admin/memberships/sync?ifStale=1", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.lastSyncedAt) setLastSyncedAt(d.lastSyncedAt);
        if (d && !d.syncSkipped) load(activeSearch);
      })
      .catch(() => {});
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayedMemberships = useMemo(
    () => sortMemberships(memberships, sortKey, sortDir),
    [memberships, sortKey, sortDir],
  );

  async function handleSync() {
    setSyncing(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/memberships/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setMessage(
        `Синхронизация: новых ${data.imported ?? 0}, обновлено ${data.updated ?? 0}, пропущено ${data.skipped ?? 0}`,
      );
      if (data.lastSyncedAt) setLastSyncedAt(data.lastSyncedAt);
      load(activeSearch);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSyncing(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    setActiveSearch(q);
    load(q);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDir(SORT_DEFAULT_DESC.includes(key) ? "desc" : "asc");
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">Абонементы</h1>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="rounded-lg bg-lime-600 px-4 py-2 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50"
        >
          {syncing ? "Синхронизация…" : "Синхронизировать с Google Sheets"}
        </button>
      </div>

      <form onSubmit={handleSearch} className="mt-4 flex flex-wrap gap-2">
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Телефон или номер абонемента (Q2, E01…)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
        >
          Найти
        </button>
        <button
          type="button"
          onClick={() => {
            setSearchQuery("");
            setActiveSearch("");
            load();
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-500"
        >
          Сбросить
        </button>
      </form>
      <p className="mt-1 text-xs text-slate-400">
        Телефон: полный номер или последние 7 цифр (6600435, 80296600435…)
      </p>

      {lastSyncedAt && (
        <p className="mt-2 text-xs text-slate-500">
          Последняя синхронизация:{" "}
          {new Date(lastSyncedAt).toLocaleString("ru-RU")}
        </p>
      )}

      {message && (
        <p
          className={`mt-3 text-sm ${message.includes("Ошибка") || message.includes("Не") ? "text-red-600" : "text-slate-600"}`}
        >
          {message}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-slate-500">Загрузка…</p>
      ) : (
        <>
          <p className="mt-4 text-xs text-slate-500">
            {activeSearch
              ? `Найдено: ${displayedMemberships.length}`
              : `Всего: ${displayedMemberships.length}`}
            {" · "}
            Нажмите заголовок столбца для сортировки (▼ больше → меньше, ▲ меньше → больше)
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-2">
                    <SortHeader
                      label="Код"
                      active={sortKey === "code"}
                      dir={sortDir}
                      onClick={() => handleSort("code")}
                    />
                  </th>
                  <th className="pr-2">
                    <SortHeader
                      label="Дата продажи"
                      active={sortKey === "saleDate"}
                      dir={sortDir}
                      onClick={() => handleSort("saleDate")}
                    />
                  </th>
                  <th className="pr-2">
                    <SortHeader
                      label="Клиент"
                      active={sortKey === "ownerName"}
                      dir={sortDir}
                      onClick={() => handleSort("ownerName")}
                    />
                  </th>
                  <th className="pr-2">
                    <SortHeader
                      label="Телефон"
                      active={sortKey === "phone"}
                      dir={sortDir}
                      onClick={() => handleSort("phone")}
                    />
                  </th>
                  <th className="pr-2">
                    <SortHeader
                      label="Категория"
                      active={sortKey === "category"}
                      dir={sortDir}
                      onClick={() => handleSort("category")}
                    />
                  </th>
                  <th className="pr-2">
                    <SortHeader
                      label="Br/мин"
                      active={sortKey === "pricePerMinute"}
                      dir={sortDir}
                      onClick={() => handleSort("pricePerMinute")}
                    />
                  </th>
                  <th className="pr-2">
                    <SortHeader
                      label="Остаток (лист)"
                      active={sortKey === "sheetRemaining"}
                      dir={sortDir}
                      onClick={() => handleSort("sheetRemaining")}
                    />
                  </th>
                  <th className="pr-2">
                    <SortHeader
                      label="Списано локально"
                      active={sortKey === "localDeducted"}
                      dir={sortDir}
                      onClick={() => handleSort("localDeducted")}
                    />
                  </th>
                  <th className="pr-2">
                    <SortHeader
                      label="Доступно"
                      active={sortKey === "available"}
                      dir={sortDir}
                      onClick={() => handleSort("available")}
                    />
                  </th>
                  <th className="pr-2">
                    <SortHeader
                      label="Синхр."
                      active={sortKey === "syncedAt"}
                      dir={sortDir}
                      onClick={() => handleSort("syncedAt")}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedMemberships.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-6 text-slate-400">
                      {activeSearch
                        ? "Ничего не найдено по запросу."
                        : "Нет абонементов. Нажмите «Синхронизировать»."}
                    </td>
                  </tr>
                ) : (
                  displayedMemberships.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100">
                      <td className="py-2 pr-2 font-mono text-xs">{m.externalCode}</td>
                      <td className="pr-2 whitespace-nowrap">{formatDateMinsk(m.saleDate)}</td>
                      <td className="pr-2">{m.ownerName ?? "—"}</td>
                      <td className="pr-2">{m.phone}</td>
                      <td className="pr-2">{m.category ?? "—"}</td>
                      <td className="pr-2">{formatPricePerMinute(m.pricePerMinute)}</td>
                      <td className="pr-2">{m.sheetRemainingMinutes}</td>
                      <td className="pr-2">{m.localDeductedMinutes}</td>
                      <td className="pr-2 font-medium">{m.effectiveRemainingMinutes}</td>
                      <td className="pr-2 text-xs text-slate-500 whitespace-nowrap">
                        {formatSyncedAt(m.syncedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
