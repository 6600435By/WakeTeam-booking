import { NextRequest, NextResponse } from "next/server";
import {
  canViewMemberships,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import {
  getLastMembershipSyncAt,
  syncMembershipsIfStale,
} from "@/lib/memberships/sync-policy";
import { syncMembershipsFromSheet } from "@/lib/memberships/sync";

function assertMembershipSyncAccess(ctx: Awaited<ReturnType<typeof requireAdminContext>>) {
  if (!canViewMemberships(ctx)) {
    throw new Error("FORBIDDEN");
  }
}

function membershipSyncError(e: unknown) {
  if (e instanceof Error) {
    if (e.message === "MEMBERSHIPS_SHEET_URL_NOT_SET") {
      return NextResponse.json(
        { error: "Не задан MEMBERSHIPS_SHEET_URL в настройках сервера" },
        { status: 500 },
      );
    }
    if (e.message === "MEMBERSHIPS_SHEET_URL_INVALID") {
      return NextResponse.json(
        {
          error:
            "Некорректный MEMBERSHIPS_SHEET_URL — нужна ссылка на опубликованный CSV Google Sheets",
        },
        { status: 500 },
      );
    }
    if (e.message === "MEMBERSHIPS_FETCH_TIMEOUT") {
      return NextResponse.json(
        {
          error:
            "Не удалось загрузить таблицу: таймаут сети. Проверьте интернет и повторите через минуту.",
        },
        { status: 504 },
      );
    }
    if (e.message.startsWith("MEMBERSHIPS_FETCH_FAILED")) {
      const status = e.message.split(":")[1];
      return NextResponse.json(
        {
          error: `Не удалось загрузить таблицу Google Sheets (HTTP ${status ?? "?"}). Проверьте, что лист опубликован.`,
        },
        { status: 502 },
      );
    }
    if (e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
  }
  return null;
}

export async function GET() {
  try {
    const ctx = await requireAdminContext();
    assertMembershipSyncAccess(ctx);
    const lastSyncedAt = await getLastMembershipSyncAt(ctx.organizationId);
    return NextResponse.json({ ok: true, lastSyncedAt });
  } catch (e) {
    const known = membershipSyncError(e);
    if (known) return known;
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
    assertMembershipSyncAccess(ctx);
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
    const known = membershipSyncError(e);
    if (known) return known;
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка синхронизации" }, { status: 500 });
  }
}
