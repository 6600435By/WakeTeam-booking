"use client";

import { useState } from "react";

export type RentalItemRow = {
  id?: string;
  name: string;
  price: number;
  sortOrder: number;
  isActive: boolean;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900";

type Props = {
  branchId: string;
  items: RentalItemRow[];
  onSaved: (items: RentalItemRow[]) => void;
};

export function RentalItemsEditor({ branchId, items, onSaved }: Props) {
  const [rows, setRows] = useState<RentalItemRow[]>(items);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  function updateRow(index: number, patch: Partial<RentalItemRow>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        name: "",
        price: 0,
        sortOrder: prev.length,
        isActive: true,
      },
    ]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const payload = rows
        .filter((r) => r.name.trim())
        .map((r, i) => ({
          id: r.id,
          name: r.name.trim(),
          price: r.price,
          sortOrder: i,
          isActive: r.isActive,
        }));
      const res = await fetch(`/api/admin/branches/${branchId}/rental-items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка сохранения");
      const saved: RentalItemRow[] = (data.items ?? []).map(
        (i: RentalItemRow) => ({
          id: i.id,
          name: i.name,
          price: i.price,
          sortOrder: i.sortOrder,
          isActive: i.isActive,
        }),
      );
      setRows(saved);
      onSaved(saved);
      setMsg("Сохранено");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">Прокат инвентаря</h2>
      <p className="mt-1 text-xs text-slate-500">
        Позиции для вейка и сапборда. Стоимость добавляется к записи один раз в
        день, не зависит от длительности катания.
      </p>

      <div className="mt-4 space-y-2">
        {rows.map((row, index) => (
          <div
            key={row.id ?? `new-${index}`}
            className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3 sm:grid-cols-[1fr_6rem_5rem_auto]"
          >
            <label className="block min-w-0">
              <span className="mb-0.5 block text-[11px] text-slate-500">
                Наименование
              </span>
              <input
                className={inputClass}
                value={row.name}
                onChange={(e) => updateRow(index, { name: e.target.value })}
                placeholder="Полный комплект"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-slate-500">
                Цена, Br
              </span>
              <input
                type="number"
                min={0}
                step={0.01}
                className={inputClass}
                value={row.price}
                onChange={(e) =>
                  updateRow(index, {
                    price: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </label>
            <label className="flex items-end gap-2 pb-1.5">
              <input
                type="checkbox"
                checked={row.isActive}
                onChange={(e) =>
                  updateRow(index, { isActive: e.target.checked })
                }
                className="rounded border-slate-300"
              />
              <span className="text-xs text-slate-600">Активно</span>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addRow}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          + Позиция
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-md bg-lime-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить инвентарь"}
        </button>
        {msg && <span className="text-sm text-lime-700">{msg}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </section>
  );
}
