# Деплой booking-crm (бесплатный стек)

Целевой стек для WakeTeam — **$0/мес** на старте:

| Сервис | Роль | Free tier |
|--------|------|-----------|
| [Vercel Hobby](https://vercel.com/docs/plans/hobby) | Хостинг Next.js | 100 GB bandwidth, serverless |
| [Neon](https://neon.tech/pricing) | PostgreSQL (prod + staging) | 0.5 GB storage, 1 project (2 БД через branch) |
| [Supabase](https://supabase.com/pricing) | Storage для фото | 1 GB storage, 2 GB egress/мес |
| [GitHub Actions](https://docs.github.com/en/billing/migrations/introducing-github-actions-billing) | CI | 2000 мин/мес (private repo) |

> **Примечание:** Vercel Hobby формально для некоммерческих проектов. Для коммерческого WakeTeam при росте может понадобиться Pro (~$20/мес). На старте Hobby обычно достаточно.

---

## Архитектура

```mermaid
flowchart LR
  User[Клиент / сотрудник] --> Vercel[Vercel Hobby]
  Vercel --> Neon[(Neon PostgreSQL)]
  Vercel --> SupaStorage[Supabase Storage]
  waketeam[waketeam.by iframe] --> Vercel
  GitHub[GitHub Actions CI] --> Vercel
```

- **БД** — только Neon (Prisma → `DATABASE_URL`)
- **Фото** — только Supabase Storage (отдельный проект, без Supabase Postgres)
- **Код** — Vercel, деплой из `main`

---

## Шаг 1. Neon PostgreSQL

### Production

1. Зарегистрироваться на [neon.tech](https://neon.tech)
2. **New Project** → имя `booking-crm-prod`, регион ближе к пользователям (EU)
3. Скопировать connection string:
   ```
   postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Включить **Point-in-time restore** (доступно на free с ограничениями — лучше, чем ничего)

### Staging

**Вариант A (рекомендуется):** Neon branch от prod-проекта

1. В Neon Console → Branches → **Create branch** `staging`
2. Отдельный `DATABASE_URL` для staging

**Вариант B:** Второй free Neon-аккаунт (если branch недоступен)

---

## Шаг 2. Supabase Storage (только файлы)

> Не используем Supabase Postgres — только Storage. БД остаётся на Neon.

1. Зарегистрироваться на [supabase.com](https://supabase.com)
2. **New Project** → имя `booking-crm-files`, регион EU
3. **Storage** → **New bucket**:
   - Name: `uploads`
   - **Public bucket**: включить (фото услуг/ресурсов публичные)
4. **Settings → API** — скопировать:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (только server-side, не в client!)

### Политики bucket (RLS)

Для public bucket с загрузкой только через API приложения:

```sql
-- В Supabase SQL Editor (опционально, если bucket не public):
-- Проще: public bucket + загрузка только через server route с service_role key
```

Загрузка идёт через [`/api/admin/upload`](../src/app/api/admin/upload/route.ts) с `service_role` — клиент напрямую в Storage не ходит.

**Локальная разработка:** если `SUPABASE_URL` не задан, upload сохраняет файлы в `public/uploads/` (fallback в [`src/lib/storage.ts`](../src/lib/storage.ts)).

---

## Шаг 3. Vercel

1. Импортировать GitHub-репозиторий на [vercel.com](https://vercel.com)
2. Framework: **Next.js** (авто)
3. Build command: `npm run build` (default)
4. **Environment Variables** (Production):

| Переменная | Значение | Среда |
|------------|----------|-------|
| `DATABASE_URL` | Neon prod connection string | Production |
| `SUPABASE_URL` | `https://xxx.supabase.co` | Production |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | Production |
| `ADMIN_EMAIL` | не нужен в prod (только seed) | — |
| `ADMIN_PASSWORD` | не нужен в prod | — |
| `MEMBERSHIPS_SHEET_URL` | URL Google Sheets | Production |
| `MEMBERSHIPS_SYNC_INTERVAL_MIN` | `15` | Production |
| `SESSION_TTL_MS` | `1209600000` (14 дней) | Production |

5. **Preview / Staging:** для branch `staging` — те же переменные, но `DATABASE_URL` = Neon staging branch

6. **Domains:** добавить `booking.waketeam.by` → CNAME на `cname.vercel-dns.com`

### Staging branch

1. Vercel → Settings → Git → **Production Branch** = `main`
2. Создать git branch `staging`, push
3. Vercel автоматически деплоит preview; можно назначить постоянный URL для `staging`

---

## Шаг 4. Первый деплой БД

Выполнить **один раз** локально (или через GitHub Action) с prod `DATABASE_URL`:

```bash
# 1. Переключить schema на postgresql (см. prisma/schema.prisma)
# 2. Применить миграции
DATABASE_URL="postgresql://..." npm run db:deploy

# 3. Seed — только если БД пустая (первый запуск)
DATABASE_URL="postgresql://..." npm run db:seed
```

> На production с реальными данными **не запускать** `db:reset` и `db:seed` повторно.

### Импорт клиентов из Rubitime

Экспорт клиентов из Rubitime — tab-separated файл (`.csv` с разделителем таб).

**Рекомендуемый порядок:**

1. **Локально** — проверить dry-run и импорт на dev-БД
2. **Staging (Neon branch)** — импорт перед приёмкой
3. **Production** — после `db:deploy` + `db:seed`, **до** переключения виджета на waketeam.by

```bash
# Просмотр статистики без записи в БД
npm run db:import-clients -- /path/to/clients-export.csv --dry-run

# Импорт (upsert по телефону, org waketeam)
DATABASE_URL="postgresql://..." npm run db:import-clients -- /path/to/clients-export.csv
```

Скрипт:
- нормализует телефоны (`+375…`)
- объединяет дубликаты по номеру
- пропускает номера короче 9 цифр (~10 строк в типичном экспорте)
- сохраняет метаданные Rubitime в поле `notes`

Повторный запуск безопасен (upsert).

**Порядок первого go-live:**

1. `db:deploy` на staging → smoke-тест
2. `db:deploy` на prod
3. `db:seed` на prod (один раз)
4. Vercel deploy
5. Чеклист приёмки (ниже)

---

## Шаг 5. GitHub Actions CI

Workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml):

- `npm ci` → `prisma generate` → `npm test` → `npm run lint` → `prisma validate` → `npm run build`

Бесплатно для private repo (~2000 мин/мес). Одна сборка ≈ 2–4 мин.

---

## Переменные окружения (полная таблица)

| Переменная | Обязательна | Где | Описание |
|------------|:-----------:|-----|----------|
| `DATABASE_URL` | да | prod, staging | Neon PostgreSQL |
| `SUPABASE_URL` | да* | prod | URL проекта Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | да* | prod | Server-side upload |
| `MEMBERSHIPS_SHEET_URL` | нет | prod | Google Sheets CSV |
| `MEMBERSHIPS_SYNC_INTERVAL_MIN` | нет | prod | Default: 15 |
| `SESSION_TTL_MS` | нет | prod | Default: 14 дней |
| `RATE_LIMIT_*` | нет | prod | In-memory лимиты (см. ниже) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | нет | local, seed | Только для `db:seed` |

\* Обязательны после внедрения Supabase Storage в код (см. план, задача uploads).

---

## Лимиты free tier и что делать

| Ограничение | Влияние на WakeTeam | Решение |
|-------------|---------------------|---------|
| Neon cold start (БД «спит») | Первый запрос после простоя 1–3 сек | Для админки приемлемо; опционально cron-ping раз в день |
| Neon 0.5 GB | Тысячи записей — хватит с запасом | Следить за ростом; апгрейд ~$19/мес |
| Supabase 1 GB storage | Сотни фото по 2 MB — хватит | Сжатие уже есть (2 MB limit в upload) |
| Vercel bandwidth 100 GB | Достаточно для виджета + админки | — |
| Rate limit in-memory | На serverless не shared между инстансами | Для WakeTeam OK; позже Upstash Redis (free) |
| Нет cron на Hobby | Memberships sync только on-demand | Приемлемо; позже Vercel Cron или external ping |

---

## Бэкап на бесплатном тарифе

Neon free: ограниченный PITR. Дополнительно — **ручной или scheduled dump**:

```bash
# Локально с установленным pg_dump
pg_dump "$DATABASE_URL" -Fc -f backup-$(date +%Y%m%d).dump
```

Опционально: GitHub Action раз в неделю → артефакт (бесплатно, хранение 90 дней).

---

## Чеклист приёмки перед prod

- [ ] Виджет `https://booking.waketeam.by/book/waketeam` — полный цикл записи
- [ ] Embed iframe на waketeam.by
- [ ] Админка: логин, журнал, CRUD записи
- [ ] Абонемент: списание минут
- [ ] Смена: открыть / закрыть (если включено)
- [ ] Загрузка фото → URL открывается → **redeploy Vercel** → фото на месте
- [ ] Staging: миграция применилась без ошибок

---

## Процесс обновлений после публикации

```mermaid
flowchart LR
  Dev[feature branch] --> PR[PR + CI green]
  PR --> Staging[deploy staging]
  Staging --> Check[чеклист]
  Check --> Main[merge main]
  Main --> Migrate["db:deploy prod"]
  Migrate --> Prod[Vercel auto-deploy]
```

1. Разработка в `feature/*`
2. PR → CI зелёный
3. Деплой на staging, ручная проверка
4. Merge в `main`
5. Если есть миграции: `DATABASE_URL=prod npm run db:deploy` **до или сразу после** deploy
6. Чеклист приёмки на prod

### Миграции БД

- Только **additive** изменения (добавить колонку, не удалять в том же релизе)
- Никогда `db push` на production
- Destructive миграции — только с `pg_dump` бэкапом

### Hotfix

1. Ветка `hotfix/описание` от `main`
2. Минимальный diff
3. Staging → prod без смешивания с незавершёнными фичами

---

## Rollback

| Что сломалось | Действие |
|---------------|----------|
| Код (UI, API) | Vercel → Deployments → Promote предыдущий |
| Миграция БД | **Не откатывать** без бэкапа; лучше forward-fix |
| Фото | Supabase Storage versioning / перезаливка |

---

## Стоимость при росте (ориентир)

| Триггер | Апгрейд | ~Цена |
|---------|---------|-------|
| Коммерческое использование | Vercel Pro | $20/мес |
| БД > 0.5 GB | Neon Launch | $19/мес |
| Фото > 1 GB | Supabase Pro | $25/мес |
| Жёсткий rate limit | Upstash Redis free → paid | от $0 |

Для WakeTeam (3 филиала, десятки записей/день) free tier должен хватить **на несколько месяцев и более**.

---

## Связанные документы

- [WORDPRESS.md](./WORDPRESS.md) — embed на waketeam.by
- [SPEC.md](./SPEC.md) — продуктовая спецификация
- План доработок — `.cursor/plans/post-launch_development_workflow_*.plan.md`
