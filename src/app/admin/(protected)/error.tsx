"use client";

import { useEffect } from "react";

export default function AdminProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg p-6">
      <h2 className="text-lg font-semibold text-slate-900">Ошибка загрузки страницы</h2>
      <p className="mt-2 text-sm text-slate-600">
        Попробуйте обновить страницу. Если ошибка повторяется, обратитесь к администратору.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md bg-lime-600 px-4 py-2 text-sm font-medium text-white hover:bg-lime-700"
      >
        Повторить
      </button>
    </div>
  );
}
