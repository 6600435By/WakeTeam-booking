"use client";

import { adminFetch } from "@/lib/admin-fetch";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      className={
        compact
          ? "touch-manipulation rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 active:bg-slate-100"
          : "touch-manipulation text-sm text-slate-500 hover:text-slate-800"
      }
      onClick={async () => {
        await adminFetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/admin/login";
      }}
    >
      Выйти
    </button>
  );
}
