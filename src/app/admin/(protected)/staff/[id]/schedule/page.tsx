import Link from "next/link";
import { redirect } from "next/navigation";
import { ScheduleEditor } from "@/components/admin/ScheduleEditor";
import { canManageBranchSettings, getAdminContext } from "@/lib/admin-access";

export default async function StaffSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");
  if (!canManageBranchSettings(ctx)) redirect("/admin/journal");

  const { id } = await params;
  return (
    <div>
      <Link href="/admin/journal" className="text-sm text-sky-600 hover:underline">
        ← Журнал
      </Link>
      <h1 className="mt-4 text-xl font-bold sm:text-2xl">График работы</h1>
      <div className="mt-6 max-w-xl">
        <ScheduleEditor staffId={id} />
      </div>
    </div>
  );
}
