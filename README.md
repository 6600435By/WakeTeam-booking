# booking-crm

Система онлайн-записи и CRM для WakeTeam (вейк-парки Раубичи, Друзья, Стайки). Замена Rubitime.

## Документация

- [docs/SPEC.md](docs/SPEC.md) — полная спецификация платформы
- [docs/AGENT.md](docs/AGENT.md) — спринты для разработки
- [docs/WORDPRESS.md](docs/WORDPRESS.md) — интеграция с waketeam.by

## Стек

Next.js 16 · TypeScript · Prisma · SQLite (dev) / PostgreSQL (prod) · Tailwind CSS

## Быстрый старт

```bash
cp .env.example .env
npm install --cache .npm-cache
npx prisma db push
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
| `npm run db:seed` | Seed: 3 филиала, ресурсы, услуги |
| `npm run db:push` | Синхронизация схемы БД |

## Статус

MVP WakeTeam: публичный виджет (5 шагов), админ-журнал, CRUD записей, график staff, embed для WordPress.
