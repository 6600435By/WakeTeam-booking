import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin-access";
import { ShiftReviewPage } from "@/components/admin/shift/ShiftReviewPage";

export default async function ShiftReviewRoute() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");
  if (!ctx.isSuperAdmin) redirect("/admin/shift");

  return <ShiftReviewPage />;
}
