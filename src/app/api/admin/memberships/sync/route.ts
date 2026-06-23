import { NextRequest, NextResponse } from "next/server";
import { handleAdminError, requireAdminContext } from "@/lib/admin-access";
import {
  getLastMembershipSyncAt,
  syncMembershipsIfStale,
} from "@/lib/memberships/sync-policy";
import { syncMembershipsFromSheet } from "@/lib/memberships/sync";

export async function GET() {
  try {
    const ctx = await requireAdminContext();
    const lastSyncedAt = await getLastMembershipSyncAt(ctx.organizationId);
    return NextResponse.json({ ok: true, lastSyncedAt });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const ifStale = req.nextUrl.searchParams.get("ifStale") === "1";
    const result = ifStale
      ? await syncMembershipsIfStale(ctx.organizationId)
      : {
          syncSkipped: false as const,
          ...(await syncMembershipsFromSheet(ctx.organizationId)),
          lastSyncedAt: await getLastMembershipSyncAt(ctx.organizationId),
        };
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "MEMBERSHIPS_SHEET_URL_NOT_SET") {
        return NextResponse.json(
          { error: "Не задан MEMBERSHIPS_SHEET_URL" },
          { status: 500 },
        );
      }
      if (e.message.startsWith("MEMBERSHIPS_FETCH_FAILED")) {
        return NextResponse.json(
          { error: "Не удалось загрузить таблицу Google Sheets" },
          { status: 502 },
        );
      }
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка синхронизации" }, { status: 500 });
  }
}
