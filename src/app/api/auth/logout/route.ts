import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-access";
import { fireAdminActivityFromContext } from "@/lib/audit/admin-activity-log";
import { destroySession } from "@/lib/auth";

export async function POST() {
  const ctx = await getAdminContext();
  if (ctx) {
    fireAdminActivityFromContext(ctx, {
      action: "logout",
      summary: `Выход: ${ctx.user.login}`,
    });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
