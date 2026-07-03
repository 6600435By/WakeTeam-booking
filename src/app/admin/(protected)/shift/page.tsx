import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin-access";
import { ShiftAdminPage } from "@/components/admin/shift/ShiftAdminPage";

export default async function ShiftPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  return (
    <ShiftAdminPage
      role={ctx.role}
      branchId={ctx.branchId}
      memberId={ctx.memberId}
      tasksOnly={false}
    />
  );
}
