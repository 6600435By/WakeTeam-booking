import { NextResponse } from "next/server";
import { getAdminContext, handleAdminError, canManageUsers, canSetPayRates, canViewStaffUsers } from "@/lib/admin-access";

export async function GET() {
  try {
    const ctx = await getAdminContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({
      user: {
        id: ctx.user.id,
        login: ctx.user.login,
        email: ctx.user.email,
        name: ctx.user.name,
        lastName: ctx.user.lastName,
      },
      role: ctx.role,
      branchId: ctx.branchId,
      branchName: ctx.branchName,
      isSuperAdmin: ctx.isSuperAdmin,
      isBranchAdmin: ctx.isBranchAdmin,
      isBranchOperator: ctx.isBranchOperator,
      canManageUsers: canManageUsers(ctx),
      canSetPayRates: canSetPayRates(ctx),
      canViewStaffUsers: canViewStaffUsers(ctx),
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
