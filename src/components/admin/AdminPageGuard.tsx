"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AdminRole } from "@/lib/admin-roles";

const SUPER_ADMIN_ROLE = "super_admin";
const BRANCH_MANAGER_ROLE = "branch_manager";
const BRANCH_ADMIN_ROLE = "branch_admin";

type Props = {
  role: AdminRole;
  children: React.ReactNode;
};

function isAllowed(pathname: string, role: AdminRole) {
  if (pathname.startsWith("/admin/logs")) {
    return role === SUPER_ADMIN_ROLE;
  }
  if (pathname.startsWith("/admin/help")) {
    return true;
  }
  if (role === SUPER_ADMIN_ROLE) return true;
  if (role === BRANCH_MANAGER_ROLE) {
    return !pathname.startsWith("/admin/widget");
  }
  if (role === BRANCH_ADMIN_ROLE) {
    return !pathname.startsWith("/admin/widget");
  }
  return (
    pathname.startsWith("/admin/journal") ||
    pathname.startsWith("/admin/shift") ||
    pathname.startsWith("/admin/help")
  );
}

export function AdminPageGuard({ role, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isAllowed(pathname, role)) {
      router.replace("/admin/journal");
    }
  }, [pathname, role, router]);

  return children;
}
