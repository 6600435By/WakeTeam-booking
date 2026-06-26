"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./LogoutButton";
import { useAdminViewport } from "./AdminViewportContext";

const links = [
  { href: "/admin/journal", label: "Журнал", short: "Журнал" },
  { href: "/admin/statistics", label: "Статистика", short: "Стат." },
  { href: "/admin/clients", label: "Клиенты", short: "Клиенты" },
  { href: "/admin/memberships", label: "Абонементы", short: "Абон." },
  { href: "/admin/branches", label: "Филиалы", short: "Филиал" },
  { href: "/admin/widget", label: "Виджет", short: "Виджет" },
];

export type AdminNavInfo = {
  email: string;
  name: string | null;
  branchName: string | null;
  isSuperAdmin: boolean;
};

function isLinkActive(pathname: string, href: string) {
  if (href === "/admin/widget") return pathname === "/admin/widget";
  return pathname.startsWith(href);
}

function pageTitle(pathname: string) {
  const match = links.find((l) => isLinkActive(pathname, l.href));
  return match?.label ?? "Админ";
}

function branchCaption(admin: AdminNavInfo) {
  if (admin.isSuperAdmin) return "Все филиалы";
  return admin.branchName ?? admin.email;
}

type Props = {
  admin: AdminNavInfo;
};

export function AdminNav({ admin }: Props) {
  const pathname = usePathname();
  const viewport = useAdminViewport();
  const isDesktop = viewport === "desktop";
  const title = pageTitle(pathname);
  const caption = branchCaption(admin);

  if (isDesktop) {
    return (
      <nav className="mb-4 shrink-0 border-b border-slate-200 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-lg font-bold text-slate-900">WakeTeam Admin</span>
            <p className="truncate text-xs text-slate-500">{caption}</p>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2 pl-6">
            {links.map((l) => {
              const active = isLinkActive(pathname, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={
                    active
                      ? "font-medium text-lime-700"
                      : "text-slate-600 hover:text-slate-900"
                  }
                >
                  {l.label}
                </Link>
              );
            })}
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
      </nav>
    );
  }

  return (
    <>
      <header className="admin-mobile-header fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="flex h-12 items-center justify-between gap-3 px-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold leading-tight text-slate-900">
              {title}
            </p>
            <p className="truncate text-[11px] leading-tight text-slate-500">{caption}</p>
          </div>
          <LogoutButton compact />
        </div>
      </header>

      <nav
        className="admin-mobile-tabbar fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-white/80"
        aria-label="Навигация"
      >
        <div className="grid grid-cols-6">
          {links.map((l) => {
            const active = isLinkActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex min-h-[52px] touch-manipulation flex-col items-center justify-center px-0.5 py-1 text-[9px] leading-tight sm:text-[10px] ${
                  active ? "font-semibold text-lime-700" : "text-slate-600"
                }`}
              >
                <span className="text-base leading-none">{active ? "●" : "○"}</span>
                <span className="mt-0.5 max-w-full truncate">{l.short}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
