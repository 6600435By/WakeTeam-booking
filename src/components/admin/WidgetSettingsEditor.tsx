"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_WIDGET_SETTINGS,
  type WidgetSettings,
  widgetThemeVars,
} from "@/lib/widget-settings";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-lime-500 focus:outline-none focus:ring-1 focus:ring-lime-500";

export function WidgetSettingsEditor() {
  const [settings, setSettings] = useState<WidgetSettings>(DEFAULT_WIDGET_SETTINGS);
  const [slug, setSlug] = useState("waketeam");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/widget-settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) setSettings(d.settings);
        if (d.slug) setSlug(d.slug);
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/admin/widget-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setMsg(res.ok ? "Сохранено" : "Ошибка сохранения");
  }

  function setTheme<K extends keyof WidgetSettings["theme"]>(
    key: K,
    value: WidgetSettings["theme"][K],
  ) {
    setSettings((s) => ({ ...s, theme: { ...s.theme, [key]: value } }));
  }

  function setText<K extends keyof WidgetSettings["texts"]>(
    key: K,
    value: WidgetSettings["texts"][K],
  ) {
    setSettings((s) => ({ ...s, texts: { ...s.texts, [key]: value } }));
  }

  if (loading) return <p className="text-slate-500">Загрузка…</p>;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">Цвета</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["primaryColor", "Основной"],
                ["accentColor", "Акцент"],
                ["buttonBg", "Кнопки"],
                ["buttonText", "Текст кнопок"],
                ["pageBackground", "Фон виджета"],
                ["cardBackground", "Фон карточек"],
                ["stepActiveBg", "Активный шаг"],
                ["stepInactiveBg", "Пройденный шаг"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="text-xs text-slate-500">{label}</span>
                <div className="mt-1 flex gap-2">
                  <input
                    type="color"
                    value={settings.theme[key]}
                    onChange={(e) => setTheme(key, e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded border border-slate-200"
                  />
                  <input
                    className={inputClass}
                    value={settings.theme[key]}
                    onChange={(e) => setTheme(key, e.target.value)}
                  />
                </div>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">Тексты</h2>
          <div className="mt-3 space-y-3">
            {(
              [
                ["title", "Заголовок"],
                ["subtitle", "Подзаголовок"],
                ["wakeLabel", "Вейкбординг"],
                ["supLabel", "Сапборд"],
                ["submitButton", "Кнопка записи"],
                ["emptySlotsHint", "Нет слотов (вейк)"],
                ["callAdminLabel", "Кнопка звонка"],
                ["callAdminPhone", "Телефон (tel:)"],
                ["successTitle", "Успех — заголовок"],
                ["successMessage", "Успех — текст"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="text-xs text-slate-500">{label}</span>
                <input
                  className={`${inputClass} mt-1`}
                  value={settings.texts[key]}
                  onChange={(e) => setText(key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">Ссылка и embed</h2>
          <p className="mt-2 text-sm text-slate-600">
            <a
              href={`/book/${slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-lime-700 underline"
            >
              /book/{slug}
            </a>
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">{`<iframe src="${typeof window !== "undefined" ? window.location.origin : ""}/book/${slug}?embed=1" width="100%" height="600" frameborder="0"></iframe>`}</pre>
        </section>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-lime-600 px-4 py-2 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить настройки"}
        </button>
        {msg && <p className="text-sm text-slate-600">{msg}</p>}
      </div>

      <div
        className="rounded-xl p-4 lg:sticky lg:top-4 lg:self-start"
        style={{
          background: settings.theme.pageBackground,
          ...widgetThemeVars(settings.theme),
        }}
      >
        <p className="mb-2 text-xs font-medium text-slate-500">Превью</p>
        <h3 className="text-lg font-bold text-slate-900">{settings.texts.title}</h3>
        <p className="text-sm text-slate-600">{settings.texts.subtitle}</p>
        <div className="mt-3 flex gap-1">
          {settings.texts.stepLabels.slice(0, 3).map((label, i) => (
            <span
              key={label}
              className="rounded px-2 py-1 text-xs"
              style={{
                background: i === 1 ? settings.theme.stepActiveBg : settings.theme.stepInactiveBg,
                color: i === 1 ? settings.theme.buttonText : "#fff",
              }}
            >
              {label}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="mt-4 rounded-lg px-4 py-2 text-sm font-medium"
          style={{
            background: settings.theme.buttonBg,
            color: settings.theme.buttonText,
          }}
        >
          {settings.texts.submitButton}
        </button>
        <p className="mt-4 text-center text-sm underline" style={{ color: settings.theme.primaryColor }}>
          {settings.texts.callAdminLabel}
        </p>
      </div>
    </div>
  );
}
