"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Service = {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  allowedDurations: string;
  isActive: boolean;
  branch: { id: string; name: string };
  staff: { staff: { id: string; name: string } }[];
};

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/services")
      .then((r) => r.json())
      .then((d) => setServices(d.services ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-xl font-bold sm:text-2xl">Услуги</h1>
      {loading ? (
        <p className="mt-4 text-slate-500">Загрузка…</p>
      ) : (
        <div className="mt-6 space-y-3">
          {services.map((s) => (
            <div
              key={s.id}
              className="rounded-lg bg-white p-4 shadow ring-1 ring-slate-200"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-slate-500">{s.branch.name}</p>
                  <h2 className="font-semibold text-slate-900">{s.name}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    от {s.price} Br · {s.allowedDurations} мин
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    s.isActive ? "bg-green-100 text-green-800" : "bg-slate-100"
                  }`}
                >
                  {s.isActive ? "Активна" : "Неактивна"}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Ресурсы:{" "}
                {s.staff.map((x) => (
                  <Link
                    key={x.staff.id}
                    href={`/admin/staff/${x.staff.id}/schedule`}
                    className="mr-2 text-sky-600 hover:underline"
                  >
                    {x.staff.name}
                  </Link>
                ))}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
