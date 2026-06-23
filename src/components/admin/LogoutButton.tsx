"use client";

export function LogoutButton() {
  return (
    <button
      type="button"
      className="text-sm text-slate-500 hover:text-slate-800"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/admin/login";
      }}
    >
      Выйти
    </button>
  );
}
