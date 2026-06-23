"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutButton } from "./LogoutButton";

const links = [
  { href: "/admin/journal", label: "Журнал", short: "Журнал" },
  { href: "/admin/statistics", label: "Статистика", short: "Стат." },
  { href: "/admin/clients", label: "Клиенты", short: "Клиенты" },
  { href: "/admin/memberships", label: "Абонементы", short: "Абон." },
  { href: "/admin/branches", label: "Филиалы", short: "Филиал" },
  { href: "/admin/services", label: "Услуги", short: "Услуги" },
];

type AdminInfo = {
  email: string;
  name: string | null;
  role: string;
  branchName: string | null;
  isSuperAdmin: boolean;
};

export function AdminNav() {
  const pathname = usePathname();
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) {
          setAdmin({
            email: d.user.email,
            name: d.user.name,
            role: d.role,
            branchName: d.branchName,
            isSuperAdmin: d.isSuperAdmin,
          });
        }
      });
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <>
      <nav className="mb-4 border-b border-slate-200 pb-3 md:mb-8 md:pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="font-bold text-slate-900">WakeTeam Admin</span>
            {admin && (
              <p className="truncate text-xs text-slate-500">
                {admin.isSuperAdmin
                  ? "Все филиалы"
                  : admin.branchName ?? admin.email}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label="Меню"
            >
              {menuOpen ? "✕" : "☰"}
            </button>
            <LogoutButton />
          </div>

          <div className="hidden items-center gap-4 md:flex md:flex-wrap">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={
                  pathname.startsWith(l.href)
                    ? "font-medium text-lime-700"
                    : "text-slate-600 hover:text-slate-900"
                }
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/book/waketeam"
              className="text-slate-500 hover:text-slate-800"
              target="_blank"
            >
              Виджет ↗
            </Link>
            <div className="ml-auto">
              <LogoutButton />
            </div>
          </div>
        </div>

        {menuOpen && (
          <div className="mt-3 space-y-1 rounded-lg border border-slate-200 bg-white p-2 shadow-sm md:hidden">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`block rounded-lg px-3 py-2.5 text-sm ${
                  pathname.startsWith(l.href)
                    ? "bg-lime-50 font-medium text-lime-800"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/book/waketeam"
              target="_blank"
              className="block rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              Виджет ↗
            </Link>
          </div>
        )}
      </nav>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Быстрая навигация"
      >
        <div className="grid grid-cols-6">
          {links.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex flex-col items-center px-1 py-2 text-[10px] leading-tight ${
                  active
                    ? "font-semibold text-lime-700"
                    : "text-slate-600"
                }`}
              >
                <span className="text-base leading-none">{active ? "●" : "○"}</span>
                <span className="mt-0.5 truncate">{l.short}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
