import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <h1 className="text-3xl font-bold text-slate-900">WakeTeam Booking CRM</h1>
      <p className="mt-4 text-slate-600">
        Система онлайн-записи для вейк-парков WakeTeam (замена Rubitime).
      </p>
      <ul className="mt-8 space-y-3">
        <li>
          <Link
            href="/book/waketeam"
            className="font-medium text-lime-700 hover:underline"
          >
            Публичный виджет записи →
          </Link>
        </li>
        <li>
          <Link
            href="/admin/login"
            className="font-medium text-lime-700 hover:underline"
          >
            Вход в админ-панель →
          </Link>
        </li>
      </ul>
    </main>
  );
}
