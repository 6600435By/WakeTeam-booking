"use client";

import { useEffect, useState } from "react";

type Branch = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  description: string | null;
  isActive: boolean;
  _count: { staff: number; services: number };
};

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/branches")
      .then((r) => r.json())
      .then((d) => setBranches(d.branches ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-xl font-bold sm:text-2xl">Филиалы</h1>
      {loading ? (
        <p className="mt-4 text-slate-500">Загрузка…</p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {branches.map((b) => (
            <div
              key={b.id}
              className="rounded-lg bg-white p-4 shadow ring-1 ring-slate-200"
            >
              <h2 className="font-semibold text-slate-900">{b.name}</h2>
              {b.address && <p className="mt-1 text-sm text-slate-600">{b.address}</p>}
              {b.description && (
                <p className="mt-1 text-sm text-slate-500">{b.description}</p>
              )}
              <p className="mt-2 text-xs text-slate-400">
                Ресурсов: {b._count.staff} · Услуг: {b._count.services}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
