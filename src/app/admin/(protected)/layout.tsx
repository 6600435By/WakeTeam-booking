import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminPageGuard } from "@/components/admin/AdminPageGuard";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  SuperAdminBranchBar,
  SuperAdminBranchProvider,
} from "@/components/admin/SuperAdminBranchProvider";
import { ShiftOpenBanner } from "@/components/admin/shift/ShiftOpenBanner";
import { getAdminContext } from "@/lib/admin-access";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAdminContext();
  if (!ctx) {
    redirect("/admin/login");
  }

  return (
    <AdminShell>
      <SuperAdminBranchProvider
        branchPickerMode={
          ctx.isSuperAdmin ? "super" : ctx.isBranchManager ? "manager" : null
        }
        managedBranchIds={ctx.managedBranchIds}
      >
        <div className="admin-app-scroll min-h-0 flex-1 overflow-x-hidden admin-desktop:overflow-y-auto">
        <AdminNav
          admin={{
            email: ctx.user.email ?? "",
            login: ctx.user.login,
            name: ctx.user.name,
            branchName: ctx.branchName,
            role: ctx.role,
            isSuperAdmin: ctx.isSuperAdmin,
          }}
        />
        <SuperAdminBranchBar />
        <AdminPageGuard role={ctx.role}>
          <ShiftOpenBanner />
          <main className="admin-main block overflow-visible">{children}</main>
        </AdminPageGuard>
      </div>
      </SuperAdminBranchProvider>
    </AdminShell>
  );
}
