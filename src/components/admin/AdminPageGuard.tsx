"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

type AdminRole = "super_admin" | "branch_admin" | "branch_operator";

const SUPER_ADMIN_ROLE = "super_admin";
const BRANCH_ADMIN_ROLE = "branch_admin";

type Props = {
  role: AdminRole;
  children: React.ReactNode;
};

function isAllowed(pathname: string, role: AdminRole) {
  if (role === SUPER_ADMIN_ROLE) return true;
  if (role === BRANCH_ADMIN_ROLE) {
    return (
      !pathname.startsWith("/admin/users") &&
      !pathname.startsWith("/admin/widget") &&
      !pathname.startsWith("/admin/shift-review")
    );
  }
  return (
    pathname.startsWith("/admin/journal") ||
    pathname.startsWith("/admin/shift")
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
