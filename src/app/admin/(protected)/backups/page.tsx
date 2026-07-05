import { BackupsPage } from "@/components/admin/BackupsPage";
import { getAdminContext } from "@/lib/admin-access";
import { redirect } from "next/navigation";

export default async function AdminBackupsPage() {
  const ctx = await getAdminContext();
  if (!ctx?.isSuperAdmin) {
    redirect("/admin/journal");
  }
  return <BackupsPage />;
}
