import { redirect } from "next/navigation";
import { UsersAdminPage } from "@/components/admin/UsersAdminPage";
import { canManageUsers, getAdminContext } from "@/lib/admin-access";

export default async function UsersPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login?from=/admin/users");
  if (!canManageUsers(ctx)) redirect("/admin/journal");

  return <UsersAdminPage />;
}
