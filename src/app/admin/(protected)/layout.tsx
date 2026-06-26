import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminShell } from "@/components/admin/AdminShell";
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
      <AdminNav
        admin={{
          email: ctx.user.email,
          name: ctx.user.name,
          branchName: ctx.branchName,
          isSuperAdmin: ctx.isSuperAdmin,
        }}
      />
      <main className="admin-main admin-desktop:min-h-0 admin-desktop:flex-1">
        {children}
      </main>
    </AdminShell>
  );
}
