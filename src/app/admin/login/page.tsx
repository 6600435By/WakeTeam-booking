"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("admin@waketeam.by");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const from = searchParams.get("from") || "/admin/journal";
      router.push(from);
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error ?? "Ошибка входа");
    }
    setLoading(false);
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 py-8">
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Вход в админку</h1>
      <p className="mt-2 text-sm text-slate-500">WakeTeam Booking CRM</p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-lime-600 py-3 font-semibold text-white hover:bg-lime-700 disabled:opacity-50"
        >
          {loading ? "Вход…" : "Войти"}
        </button>
      </form>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
