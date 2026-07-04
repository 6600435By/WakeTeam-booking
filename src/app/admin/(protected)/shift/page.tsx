import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin-access";
import { ShiftAdminPage } from "@/components/admin/shift/ShiftAdminPage";

export default async function ShiftPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  return (
    <Suspense fallback={<p className="p-4 text-sm text-slate-500">Загрузка…</p>}>
      <ShiftAdminPage
        role={ctx.role}
        branchId={ctx.branchId}
        memberId={ctx.memberId}
        workAsAdminElevated={ctx.workAsAdminElevated}
        managerOnDutyElevated={ctx.managerOnDutyElevated}
        managerOnDutyBranchId={ctx.managerOnDutyBranchId}
        isBranchManager={ctx.isBranchManager}
        managedBranchIds={ctx.managedBranchIds}
        tasksOnly={false}
      />
    </Suspense>
  );
}
