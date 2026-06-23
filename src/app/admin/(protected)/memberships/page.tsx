"use client";

import { useCallback, useEffect, useState } from "react";

type Membership = {
  id: string;
  externalCode: string;
  category: string | null;
  ownerName: string | null;
  phone: string;
  initialMinutes: number;
  sheetRemainingMinutes: number;
  localDeductedMinutes: number;
  effectiveRemainingMinutes: number;
  comment: string | null;
  saleDate: string | null;
  syncedAt: string;
};

export default function MembershipsPage() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [phoneFilter, setPhoneFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const load = useCallback((phone?: string) => {
    setLoading(true);
    const q = phone?.trim() ? `?phone=${encodeURIComponent(phone.trim())}` : "";
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
        if (d && !d.syncSkipped) load();
      })
      .catch(() => {});
    load();
  }, [load]);

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
      load(phoneFilter);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSyncing(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    load(phoneFilter);
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
          type="tel"
          placeholder="Фильтр по телефону"
          value={phoneFilter}
          onChange={(e) => setPhoneFilter(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
            setPhoneFilter("");
            load();
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-500"
        >
          Сбросить
        </button>
      </form>

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
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">Код</th>
                <th>Клиент</th>
                <th>Телефон</th>
                <th>Категория</th>
                <th>Остаток (лист)</th>
                <th>Списано локально</th>
                <th>Доступно</th>
                <th>Синхр.</th>
              </tr>
            </thead>
            <tbody>
              {memberships.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-slate-400">
                    Нет абонементов. Нажмите «Синхронизировать».
                  </td>
                </tr>
              ) : (
                memberships.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100">
                    <td className="py-2 font-mono text-xs">{m.externalCode}</td>
                    <td>{m.ownerName ?? "—"}</td>
                    <td>{m.phone}</td>
                    <td>{m.category ?? "—"}</td>
                    <td>{m.sheetRemainingMinutes}</td>
                    <td>{m.localDeductedMinutes}</td>
                    <td className="font-medium">{m.effectiveRemainingMinutes}</td>
                    <td className="text-xs text-slate-500">
                      {new Date(m.syncedAt).toLocaleString("ru-RU")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
