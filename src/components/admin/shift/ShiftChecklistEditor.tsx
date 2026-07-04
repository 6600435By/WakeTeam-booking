"use client";

import { useCallback, useEffect, useState } from "react";

type Item = { id: string; label: string; sortOrder: number; isActive: boolean };

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";
const btn = "rounded-lg px-3 py-1.5 text-sm font-medium";
const btnPrimary = `${btn} bg-slate-900 text-white`;
const btnSecondary = `${btn} border border-slate-300 bg-white`;

export function ShiftChecklistEditor({ branchId }: { branchId: string }) {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [meRes, listRes] = await Promise.all([
      fetch("/api/admin/me"),
      fetch(`/api/admin/branches/${branchId}/shift-checklist`),
    ]);
    const me = await meRes.json();
    setIsSuperAdmin(Boolean(me.isSuperAdmin));
    if (listRes.ok) {
      const d = await listRes.json();
      setItems((d.items ?? []).filter((i: Item) => i.isActive));
    }
    setLoading(false);
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isSuperAdmin) return null;
  if (loading) return null;

  async function addItem() {
    if (!newLabel.trim()) return;
    const r = await fetch(`/api/admin/branches/${branchId}/shift-checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim() }),
    });
    if (r.ok) {
      setNewLabel("");
      await load();
    }
  }

  async function removeItem(id: string) {
    const r = await fetch(`/api/admin/branches/${branchId}/shift-checklist/${id}`, {
      method: "DELETE",
    });
    if (r.ok) await load();
  }

  async function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    const r = await fetch(`/api/admin/branches/${branchId}/shift-checklist`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: next.map((i) => i.id) }),
    });
    if (r.ok) {
      const d = await r.json();
      setItems((d.items ?? []).filter((i: Item) => i.isActive));
    } else {
      await load();
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-900">Чеклист смены</h2>
      <p className="mt-1 text-xs text-slate-500">
        Пункты для проверки при закрытии смены (оборудование, чистота, касса…)
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            <div className="flex shrink-0 flex-col gap-0.5">
              <button
                type="button"
                className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] leading-none text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                disabled={index === 0}
                aria-label="Выше"
                onClick={() => void moveItem(index, -1)}
              >
                ▲
              </button>
              <button
                type="button"
                className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] leading-none text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                disabled={index === items.length - 1}
                aria-label="Ниже"
                onClick={() => void moveItem(index, 1)}
              >
                ▼
              </button>
            </div>
            <span className="min-w-0 flex-1">{item.label}</span>
            <button type="button" className="shrink-0 text-red-600 text-xs" onClick={() => void removeItem(item.id)}>
              Удалить
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-slate-500">Пунктов пока нет</li>
        )}
      </ul>
      <div className="mt-3 flex gap-2">
        <input
          className={inputClass}
          placeholder="Новый пункт"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <button type="button" className={btnPrimary} onClick={() => void addItem()}>
          Добавить
        </button>
      </div>
    </section>
  );
}
