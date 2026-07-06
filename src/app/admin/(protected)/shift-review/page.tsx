import { redirect } from "next/navigation";
import { getAdminContext, canReviewShifts } from "@/lib/admin-access";
import { ShiftReviewPage } from "@/components/admin/shift/ShiftReviewPage";

export default async function ShiftReviewRoute() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");
  if (!canReviewShifts(ctx)) redirect("/admin/shift");

  return (
    <ShiftReviewPage
      usesBranchPicker={ctx.isSuperAdmin || ctx.isBranchManager}
      branchId={ctx.branchId}
      isSuperAdmin={ctx.isSuperAdmin}
      isBranchAdmin={ctx.isBranchAdmin}
      isBranchManager={ctx.isBranchManager}
    />
  );
}
