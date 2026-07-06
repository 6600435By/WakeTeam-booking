"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminRole } from "@/lib/admin-roles";
import { LogoutButton } from "./LogoutButton";
import { useAdminViewport } from "./AdminViewportContext";

type NavLink = {
  href: string;
  label: string;
  short: string;
};

const ALL_LINKS: NavLink[] = [
  { href: "/admin/journal", label: "Журнал", short: "Журнал" },
  { href: "/admin/statistics", label: "Статистика", short: "Стат." },
  { href: "/admin/clients", label: "Клиенты", short: "Клиенты" },
  { href: "/admin/memberships", label: "Абонементы", short: "Абон." },
  { href: "/admin/branches", label: "Филиалы", short: "Филиал" },
  { href: "/admin/users", label: "Сотрудники", short: "Сотр." },
  { href: "/admin/widget", label: "Виджет", short: "Виджет" },
];

const SHIFT_LINK: NavLink = {
  href: "/admin/shift",
  label: "Учёт времени",
  short: "Время",
};

const REVIEW_LINK: NavLink = {
  href: "/admin/shift-review",
  label: "Проверка смен",
  short: "Смены",
};

const LOGS_LINK: NavLink = {
  href: "/admin/logs",
  label: "Журнал логов",
  short: "Логи",
};

const BACKUPS_LINK: NavLink = {
  href: "/admin/backups",
  label: "Бэкапы",
  short: "Бэкап",
};

const CALENDAR_LINK: NavLink = {
  href: "/admin/shift",
  label: "Календарь",
  short: "Календ.",
};

function linksForRole(role: AdminRole): NavLink[] {
  if (role === "super_admin") {
    return [
      ...ALL_LINKS.filter((l) => l.href !== "/admin/widget"),
      CALENDAR_LINK,
      REVIEW_LINK,
      BACKUPS_LINK,
      LOGS_LINK,
    ];
  }
  if (role === "branch_manager") {
    return [
      ...ALL_LINKS.filter((l) => l.href !== "/admin/widget"),
      CALENDAR_LINK,
      REVIEW_LINK,
    ];
  }
  if (role === "branch_admin") {
    return [
      ...ALL_LINKS.filter((l) => l.href !== "/admin/widget"),
      SHIFT_LINK,
      REVIEW_LINK,
    ];
  }
  return [
    ALL_LINKS.find((l) => l.href === "/admin/journal")!,
    SHIFT_LINK,
  ];
}

export type AdminNavInfo = {
  email: string;
  login: string;
  name: string | null;
  branchName: string | null;
  role: AdminRole;
  isSuperAdmin: boolean;
};

function isLinkActive(pathname: string, href: string) {
  if (href === "/admin/widget") return pathname.startsWith("/admin/widget");
  if (href === "/admin/users") return pathname.startsWith("/admin/users");
  if (href === "/admin/shift-review") return pathname.startsWith("/admin/shift-review");
  if (href === "/admin/shift") {
    return pathname === "/admin/shift" || pathname.startsWith("/admin/shift/");
  }
  if (href === "/admin/backups") return pathname.startsWith("/admin/backups");
  return pathname.startsWith(href);
}

function branchCaption(admin: AdminNavInfo) {
  if (admin.isSuperAdmin) return "Все филиалы";
  return admin.branchName ?? admin.name ?? admin.login;
}

type Props = {
  admin: AdminNavInfo;
};

export function AdminNav({ admin }: Props) {
  const pathname = usePathname();
  const viewport = useAdminViewport();
  const isDesktop = viewport === "desktop";
  const links = linksForRole(admin.role);
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
        <div className="relative min-w-0 flex-1">
          <nav
            className="admin-mobile-tabbar overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Навигация"
          >
            <div className="flex w-max min-w-full items-center gap-x-1 pr-6">
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
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent"
            aria-hidden
          />
        </div>
        <LogoutButton compact />
      </div>
      <p className="mt-1 text-center text-[10px] text-slate-400">← листайте меню →</p>
    </div>
  );
}
