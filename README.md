# booking-crm

Система онлайн-записи и CRM для WakeTeam (вейк-парки Раубичи, Друзья, Стайки). Замена Rubitime.

## Документация

- [docs/SPEC.md](docs/SPEC.md) — полная спецификация платформы
- [docs/AGENT.md](docs/AGENT.md) — спринты для разработки
- [docs/DEPLOY.md](docs/DEPLOY.md) — деплой (Vercel + Neon + Supabase Storage)
- [docs/WORDPRESS.md](docs/WORDPRESS.md) — интеграция с waketeam.by

## Стек

Next.js 16 · TypeScript · Prisma · PostgreSQL · Tailwind CSS

## Быстрый старт

Требуется PostgreSQL. Варианты:

- **Уже установлен** (Homebrew на Mac): создайте БД `createdb booking_crm`, в `.env` укажите `postgresql://ВАШ_MAC_USER@localhost:5432/booking_crm?schema=public`
- **Docker:** `docker run -d --name booking-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`
- **Облако:** бесплатный branch на [Neon](https://neon.tech) — см. [docs/DEPLOY.md](docs/DEPLOY.md)

```bash
cp .env.example .env
# Запустите Postgres, например:
# docker run -d --name booking-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16

npm install --cache .npm-cache
npm run db:deploy   # первый раз: применить миграции
npm run db:seed
npm run dev
```

- Виджет: http://localhost:3000/book/waketeam
- Админка: http://localhost:3000/admin/login (admin@waketeam.by / changeme)

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Dev-сервер |
| `npm run build` | Production build |
| `npm run db:deploy` | Применить миграции (production / первый запуск) |
| `npm run db:seed` | Seed: 3 филиала, ресурсы, услуги |
| `npm run db:migrate` | Создать миграцию в dev |

## Статус

MVP WakeTeam: публичный виджет (5 шагов), админ-журнал, CRUD записей, график staff, embed для WordPress.
