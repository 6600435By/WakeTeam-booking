"use client";

import { useCallback, useEffect, useState } from "react";
import { rateKindLabel, type PayRateKind } from "@/lib/payroll/resolve-rates";

type RateRow = {
  id: string;
  kind: string;
  kindLabel: string;
  amount: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isCurrent: boolean;
};

type Props = {
  userId: string;
  open: boolean;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export function PayRatesPanel({ userId, open }: Props) {
  const [rates, setRates] = useState<RateRow[]>([]);
  const [allowedKinds, setAllowedKinds] = useState<PayRateKind[]>([]);
  const [kind, setKind] = useState<PayRateKind>("panel");
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/users/${userId}/pay-rates`);
    const d = await r.json();
    if (r.ok) {
      setRates(d.rates ?? []);
      setAllowedKinds(d.allowedKinds ?? []);
      if (d.allowedKinds?.[0]) setKind(d.allowedKinds[0]);
    }
  }, [userId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function addRate() {
    const r = await fetch(`/api/admin/users/${userId}/pay-rates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        amount: Number(amount),
        effectiveFrom,
      }),
    });
    if (r.ok) {
      setAmount("");
      setMsg("Сохранено");
      load();
    }
  }

  async function removeRate(id: string) {
    await fetch(`/api/admin/users/${userId}/pay-rates/${id}`, { method: "DELETE" });
    load();
  }

  if (!open) return null;

  const current = rates.filter((r) => r.isCurrent);

  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">Тарифы (BYN/час)</h3>
      {current.length === 0 && (
        <p className="mb-2 text-xs text-slate-500">Ставки не назначены</p>
      )}
      <ul className="mb-3 space-y-1 text-sm">
        {current.map((r) => (
          <li key={r.id} className="flex justify-between">
            <span>
              {r.kindLabel}: {r.amount} BYN (с {r.effectiveFrom})
            </span>
            <button
              type="button"
              className="text-xs text-red-600"
              onClick={() => removeRate(r.id)}
            >
              Удалить
            </button>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 admin-desktop:grid-cols-4">
        <select
          className={inputClass}
          value={kind}
          onChange={(e) => setKind(e.target.value as PayRateKind)}
        >
          {allowedKinds.map((k) => (
            <option key={k} value={k}>
              {rateKindLabel(k)}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="0.01"
          className={inputClass}
          placeholder="Сумма"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          type="date"
          className={inputClass}
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
        />
        <button
          type="button"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white"
          onClick={addRate}
        >
          Добавить
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-green-600">{msg}</p>}
      {rates.length > current.length && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-500">История</summary>
          <ul className="mt-1 space-y-1 text-xs text-slate-600">
            {rates
              .filter((r) => !r.isCurrent)
              .map((r) => (
                <li key={r.id}>
                  {r.kindLabel} {r.amount} BYN · {r.effectiveFrom}
                  {r.effectiveTo ? ` – ${r.effectiveTo}` : ""}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
