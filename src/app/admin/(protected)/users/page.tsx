import { redirect } from "next/navigation";
import { UsersAdminPage } from "@/components/admin/UsersAdminPage";
import { canViewStaffUsers, getAdminContext } from "@/lib/admin-access";

export default async function UsersPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login?from=/admin/users");
  if (!canViewStaffUsers(ctx)) redirect("/admin/journal");

  return <UsersAdminPage />;
}
