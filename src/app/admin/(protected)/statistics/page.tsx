import { redirect } from "next/navigation";
import { StatisticsPage } from "@/components/admin/StatisticsPage";
import { canViewStatistics, getAdminContext } from "@/lib/admin-access";

export default async function AdminStatisticsPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login?from=/admin/statistics");
  if (!canViewStatistics(ctx)) redirect("/admin/journal");
  return <StatisticsPage />;
}
