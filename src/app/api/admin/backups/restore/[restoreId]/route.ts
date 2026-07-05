import { NextResponse } from "next/server";
import {
  canManageBackups,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { readRestoreStatus } from "@/lib/backups/storage";

type RouteContext = { params: Promise<{ restoreId: string }> };

export async function GET(_req: Request, context: RouteContext) {
  try {
    const ctx = await requireAdminContext();
    if (!canManageBackups(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { restoreId } = await context.params;
    const status = await readRestoreStatus(restoreId);
    if (!status) {
      return NextResponse.json({ error: "Статус не найден" }, { status: 404 });
    }

    return NextResponse.json({ status });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка статуса восстановления" }, { status: 500 });
  }
}
