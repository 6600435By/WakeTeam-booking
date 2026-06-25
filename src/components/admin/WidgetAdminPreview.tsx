"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function WidgetAdminPreview() {
  const [slug, setSlug] = useState("waketeam");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/admin/widget-settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.slug) setSlug(d.slug);
      })
      .catch(() => {});
  }, []);

  const bookUrl = `/book/${slug}`;
  const embedUrl = `${bookUrl}?embed=1`;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Проверка виджета</h2>
          <p className="mt-1 text-sm text-slate-500">
            Живая форма записи — как её видят клиенты
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={bookUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-lime-600 px-4 py-2 text-sm font-medium text-white hover:bg-lime-700"
          >
            Открыть в новой вкладке
          </Link>
          <Link
            href="/admin/widget/settings"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Настройки оформления
          </Link>
        </div>
      </div>

      {origin ? (
        <iframe
          title="Виджет записи WakeTeam"
          src={embedUrl}
          className="mt-4 w-full rounded-lg border border-slate-200 bg-[#f4f2f2]"
          style={{ minHeight: 640, height: "70vh" }}
        />
      ) : (
        <div className="mt-4 flex h-64 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500">
          Загрузка виджета…
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Прямая ссылка:{" "}
        <Link href={bookUrl} target="_blank" rel="noreferrer" className="text-lime-700 underline">
          {origin}
          {bookUrl}
        </Link>
      </p>
    </section>
  );
}
