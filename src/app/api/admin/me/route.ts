import { NextResponse } from "next/server";
import { getAdminContext, handleAdminError } from "@/lib/admin-access";

export async function GET() {
  try {
    const ctx = await getAdminContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
      },
      role: ctx.role,
      branchId: ctx.branchId,
      branchName: ctx.branchName,
      isSuperAdmin: ctx.isSuperAdmin,
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
