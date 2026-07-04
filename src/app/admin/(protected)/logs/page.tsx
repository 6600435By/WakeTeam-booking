import { ActivityLogPage } from "@/components/admin/ActivityLogPage";
import { getAdminContext } from "@/lib/admin-access";
import { redirect } from "next/navigation";

export default async function AdminLogsPage() {
  const ctx = await getAdminContext();
  if (!ctx?.isSuperAdmin) {
    redirect("/admin/journal");
  }
  return <ActivityLogPage />;
}
