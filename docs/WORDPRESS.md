# Интеграция с waketeam.by (замена Rubitime)

## Что было на сайте

Блок «Онлайн запись» на [waketeam.by](https://waketeam.by) подгружает виджет Rubitime через iframe (`rubitime-project-iframe`).

## Что использовать вместо

Разверните booking-crm на поддомене:

`https://booking.waketeam.by`

| URL | Назначение |
|-----|------------|
| `/book/waketeam` | Виджет для вставки на сайт |
| `/admin/login` | Вход в админку |
| `/admin/journal` | Журнал записей |

## WordPress / Elementor

1. Найдите блок с Rubitime и удалите его.
2. Вставьте HTML-блок:

```html
<div id="waketeam-booking" data-booking-url="https://booking-crm-fawn.vercel.app/book/waketeam"></div>
<script src="https://booking-crm-fawn.vercel.app/embed/waketeam-embed.js?v=5" async></script>
```

   `?v=5` — версия для сброса кэша браузера/NitroPack: при обновлении
   embed-скрипта увеличьте номер. Если подключён домен
   `booking.waketeam.by`, замените на него хост в обеих строках.

3. Кнопку «Записаться» направьте на якорь `#waketeam-booking`.
4. После изменения HTML обязательно сделайте **Purge Cache** в NitroPack.

## Админка

- URL: `https://booking.waketeam.by/admin/login`
- Логин после seed: `ADMIN_EMAIL` / `ADMIN_PASSWORD` из `.env`

## Деплой

1. PostgreSQL (Neon/Supabase) — обновите `DATABASE_URL` в production.
2. Vercel: импорт репозитория, env vars, `npm run build`.
3. Домен `booking.waketeam.by` → CNAME на Vercel.

## WooCommerce

Сертификаты и абонементы остаются на основном сайте. Этот сервис — только слоты катания.
