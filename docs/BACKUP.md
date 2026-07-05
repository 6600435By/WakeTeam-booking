# Бэкапы booking-crm

## Архитектура

- **Создание бэкапов** — GitHub Actions ([`.github/workflows/backup.yml`](../.github/workflows/backup.yml)), не нагружает Vercel
- **Хранение** — приватный Supabase bucket `backups`
- **Просмотр и восстановление** — админка `/admin/backups` (только `super_admin`)

## Расписание

| Период | БД | Файлы | Хранение |
|--------|-----|-------|----------|
| Сезон (май–окт) | ежедневно 03:00 UTC | ежедневно 04:00 UTC (если изменились) | 5 копий БД, 2 zip фото* |
| 31 октября | принудительный финал | принудительный финал | → архив сезона |
| Зима | не создаём | не создаём | 1 финальный архив |

\* При росте БД retention уменьшается автоматически (предупреждение в админке):

- БД < 100 MB → 5 копий
- 100–200 MB → 3 копии
- > 200 MB → 2 копии

Если данные за день не менялись — `pg_dump` не выполняется (только fingerprint).

## Настройка

### Supabase

1. Storage → New bucket → `backups` (private)
2. Bucket `uploads` уже используется для фото

### GitHub Secrets

| Secret | Назначение |
|--------|------------|
| `DATABASE_URL` | Neon direct URL (без pooler) |
| `SUPABASE_URL` | URL проекта |
| `SUPABASE_SERVICE_ROLE_KEY` | service role |
| `BACKUP_RESTORE_SECRET` | случайная строка для HMAC restore |

### Vercel (для восстановления из админки)

| Переменная | Назначение |
|------------|------------|
| `SUPABASE_URL` | уже есть |
| `SUPABASE_SERVICE_ROLE_KEY` | уже есть |
| `GITHUB_BACKUP_TOKEN` | PAT с `actions:write` |
| `GITHUB_REPO` | `owner/booking-crm` |
| `BACKUP_RESTORE_SECRET` | тот же, что в GitHub |

Опционально:

- `BACKUP_SEASON_START_MONTH=5`
- `BACKUP_SEASON_END_MONTH=10`
- `GITHUB_BACKUP_REF=main`

## Восстановление из админки

1. `/admin/backups` → выбрать дату бэкапа
2. **Восстановить** → галочки «База данных» / «Фото»
3. Подтвердить датой или словом `ВОССТАНОВИТЬ`
4. Дождаться прогресса → чеклист проверки

**Пример:** удалили записи 06.08 — выберите бэкап **05.08.2026**.

После восстановления БД нажмите «Синхронизировать» на странице абонементов (Google Sheets).

## Ручное восстановление (запасной путь)

```bash
# Скачать dump из админки
pg_restore --clean --if-exists --no-owner --no-acl \
  -d "$DATABASE_URL" backup.dump
```

## Оценка места (Supabase 1 GB)

| Сценарий | Итого |
|----------|-------|
| Старт | ~140–260 MB |
| 70% сезонной нагрузки | ~400–700 MB |
| Зима (1 архив) | ~80–150 MB |

## Локальная отладка

```bash
npm run backup:cli -- fingerprint-db
npm run backup:cli -- backup-db --force
npm run backup:cli -- trim
```
