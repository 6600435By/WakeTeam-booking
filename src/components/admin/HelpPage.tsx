"use client";

import { useState } from "react";
import type { AdminRole } from "@/lib/admin-roles";
import {
  faqForRole,
  GLOSSARY,
  ROLE_LABELS,
  scenariosForRole,
  sectionsForRole,
  type HelpBlock,
} from "@/lib/onboarding/help-content";
import { useOnboardingOptional } from "@/components/admin/onboarding/OnboardingProvider";
import { Button } from "@/components/ui/button";

type Props = {
  role: AdminRole;
};

function HelpBlockView({ block }: { block: HelpBlock }) {
  if (block.type === "p") {
    return <p className="text-sm leading-relaxed text-slate-700">{block.text}</p>;
  }
  if (block.type === "warning") {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {block.text}
      </p>
    );
  }
  const ListTag = block.type === "steps" ? "ol" : "ul";
  const listClass =
    block.type === "steps"
      ? "list-decimal space-y-1.5 pl-5 text-sm text-slate-700"
      : "list-disc space-y-1 pl-5 text-sm text-slate-700";
  return (
    <ListTag className={listClass}>
      {block.items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ListTag>
  );
}

export function HelpPage({ role }: Props) {
  const onboarding = useOnboardingOptional();
  const [restarting, setRestarting] = useState(false);
  const sections = sectionsForRole(role);
  const scenarios = scenariosForRole(role);
  const faq = faqForRole(role);

  async function handleRestart() {
    if (!onboarding) return;
    setRestarting(true);
    try {
      await onboarding.restartTour();
    } finally {
      setRestarting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 pb-12">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Справка</h1>
        <p className="mt-1 text-sm text-slate-600">
          Инструкции для роли: <span className="font-medium">{ROLE_LABELS[role]}</span>
        </p>
      </div>

      <nav className="mb-8 flex flex-wrap gap-2 text-sm">
        <a href="#start" className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-200">
          Начало
        </a>
        <a href="#scenarios" className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-200">
          Сценарии
        </a>
        <a href="#sections" className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-200">
          Разделы
        </a>
        <a href="#glossary" className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-200">
          Словарь
        </a>
        <a href="#faq" className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-200">
          FAQ
        </a>
      </nav>

      <section id="start" className="mb-10 scroll-mt-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Быстрый старт</h2>
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          {sections
            .filter((s) => s.id === "start")
            .flatMap((s) => s.content)
            .map((block, i) => (
              <HelpBlockView key={i} block={block} />
            ))}
        </div>
      </section>

      <section id="scenarios" className="mb-10 scroll-mt-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Типовые сценарии</h2>
        <div className="space-y-4">
          {scenarios.map((scenario) => (
            <div
              key={scenario.title}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <h3 className="font-medium text-slate-900">{scenario.title}</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                {scenario.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section id="sections" className="mb-10 scroll-mt-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Разделы приложения</h2>
        <div className="space-y-4">
          {sections
            .filter((s) => s.id !== "start" && s.id !== "permissions")
            .map((section) => (
              <div
                key={section.id}
                id={section.id}
                className="scroll-mt-4 rounded-xl border border-slate-200 bg-white p-4"
              >
                <h3 className="font-medium text-slate-900">{section.title}</h3>
                <div className="mt-2 space-y-2">
                  {section.content.map((block, i) => (
                    <HelpBlockView key={i} block={block} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      </section>

      <section id="permissions" className="mb-10 scroll-mt-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Права вашей роли</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {sections
            .filter((s) => s.id === "permissions")
            .flatMap((s) => s.content)
            .map((block, i) => (
              <HelpBlockView key={i} block={block} />
            ))}
        </div>
      </section>

      <section id="glossary" className="mb-10 scroll-mt-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Словарь</h2>
        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {GLOSSARY.map((item) => (
            <div key={item.term} className="px-4 py-3">
              <dt className="text-sm font-medium text-slate-900">{item.term}</dt>
              <dd className="mt-0.5 text-sm text-slate-600">{item.definition}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="faq" className="mb-10 scroll-mt-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Частые вопросы</h2>
        <div className="space-y-3">
          {faq.map((item) => (
            <details
              key={item.question}
              className="group rounded-xl border border-slate-200 bg-white"
            >
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-900 marker:content-none">
                <span className="flex items-center justify-between gap-2">
                  {item.question}
                  <span className="text-slate-400 group-open:rotate-180">▼</span>
                </span>
              </summary>
              <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      {onboarding && (
        <div className="rounded-xl border border-lime-200 bg-lime-50 p-4">
          <h2 className="font-medium text-slate-900">Обучающий тур</h2>
          <p className="mt-1 text-sm text-slate-600">
            Подсветка разделов и пошаговое объяснение интерфейса. Займёт 1–2 минуты.
          </p>
          <Button
            type="button"
            className="mt-3"
            disabled={restarting || onboarding.tourActive}
            onClick={() => void handleRestart()}
          >
            {restarting ? "Запуск…" : "Повторить тур"}
          </Button>
        </div>
      )}
    </div>
  );
}
