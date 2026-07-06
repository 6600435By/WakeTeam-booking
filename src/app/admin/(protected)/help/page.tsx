import { redirect } from "next/navigation";
import { HelpPage } from "@/components/admin/HelpPage";
import { getAdminContext } from "@/lib/admin-access";

export default async function AdminHelpPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");
  return <HelpPage role={ctx.role} />;
}
