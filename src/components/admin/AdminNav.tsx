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
  if (href === "/admin/widget") return pathname.startsWith("/admin/widget");
  return pathname.startsWith(href);
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
  const caption = branchCaption(admin);

  if (isDesktop) {
    return (
      <nav className="mb-3 shrink-0 border-b border-slate-200 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-lg font-bold text-slate-900">WakeTeam Admin</span>
            <p className="truncate text-xs text-slate-500">{caption}</p>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2 pl-6">
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
            {admin.isSuperAdmin && (
              <Link
                href="/book/waketeam"
                className="text-slate-500 hover:text-slate-800"
                target="_blank"
              >
                Виджет ↗
              </Link>
            )}
            <div className="ml-auto shrink-0 pr-[0.5cm]">
              <LogoutButton />
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <div className="admin-mobile-nav mb-3 shrink-0 border-b border-slate-200 pb-2">
      <div className="flex items-center gap-2">
        <nav
          className="admin-mobile-tabbar min-w-0 flex-1 overflow-x-auto [-webkit-overflow-scrolling:touch]"
          aria-label="Навигация"
        >
          <div className="flex w-max min-w-full items-center gap-x-1">
            {links.map((l) => {
              const active = isLinkActive(pathname, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`shrink-0 touch-manipulation whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs ${
                    active
                      ? "bg-lime-100 font-semibold text-lime-800"
                      : "text-slate-600 active:bg-slate-100"
                  }`}
                >
                  {l.short}
                </Link>
              );
            })}
          </div>
        </nav>
        <LogoutButton compact />
      </div>
    </div>
  );
}
