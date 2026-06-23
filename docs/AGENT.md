# Руководство для агента (booking-crm)

## Обязательно перед работой

1. Прочитайте **[SPEC.md](./SPEC.md)** — единственный источник правды по продукту и архитектуре.
2. Не копируйте бренд, тексты и дизайн Rubitime 1:1 — только функциональная идея (см. раздел 1 SPEC).
3. Реализуйте по **фазам** (MVP → v1.x → v2), не перескакивайте спринты без явного запроса пользователя.
4. При сомнениях по полю формы — ищите подраздел модуля в SPEC (раздел 5).

## Проект

| Параметр | Значение |
|----------|----------|
| Путь | `~/Projects/booking-crm` |
| Стек | Next.js 15 (App Router), TypeScript, Prisma, PostgreSQL, shadcn/ui, Tailwind |
| Auth (рекомендация) | NextAuth.js v5 (Credentials) или Clerk — зафиксировать в README при bootstrap |

## Порядок спринтов

### Спринт 0 — Bootstrap

- [ ] `npx create-next-app@latest` в корне репозитория (TS, App Router, Tailwind)
- [ ] Prisma + PostgreSQL (`DATABASE_URL` в `.env`)
- [ ] shadcn/ui init
- [ ] Базовая схема Prisma из SPEC §4 (минимум: Organization, Branch, Staff, Service, Client, Appointment)
- [ ] Auth + middleware: все `/admin/*` только для авторизованных
- [ ] Seed: одна org, один филиал, два staff, две услуги

### Спринт 1 — MVP core

1. CRUD: Company settings, Branches, Staff (+ schedule), Services
2. Clients CRUD + upsert по телефону
3. `src/lib/slots/` — движок слотов (SPEC §6)
4. Appointments API + conflict check
5. Admin: Journal day view (`/admin/journal`)
6. Modal: New/Edit appointment (SPEC §5.2)
7. Public widget `/book/[slug]` + `GET /api/public/widget-config/[slug]`
8. Widget settings: theme, texts, step flags (SPEC §5.6–5.7)

### Спринт 2 — Operations

- Statistics (filters, summary, chart, table, export CSV)
- Email notifications (Resend) + шаблоны с плейсхолдерами
- Memberships (list, create, edit)
- Document templates + HTML render + print

### Спринт 3 — Growth

- Promo codes, payments (YooKassa / Stripe), webhooks
- Integrations stubs (Bitrix, amoCRM, Google Calendar)
- Payroll, messenger — по SPEC out-of-scope до явного запроса

## Структура кода (целевая)

```
booking-crm/
  docs/
    SPEC.md
    AGENT.md
  prisma/schema.prisma
  src/
    app/
      (auth)/
      admin/
        journal/
        clients/
        staff/
        services/
        settings/
        statistics/      # v1.1
        memberships/     # v1.2
        documents/       # v1.3
      book/[slug]/       # public widget
      api/
        ...
    components/
      admin/
      widget/
    lib/
      slots/
      templates/
      notifications/
      auth/
```

## Правила коммитов

- Коммиты только по запросу пользователя.
- Один спринт / логический модуль — один PR по возможности.

## Чеклист готовности MVP

См. **SPEC.md §10** — все пункты должны проходить вручную перед закрытием MVP.

## Ссылки

- [SPEC.md](./SPEC.md) — полная спецификация
- Референс продукта (идея): https://rubitime.ru
