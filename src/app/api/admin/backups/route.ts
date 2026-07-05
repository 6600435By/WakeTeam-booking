import { NextResponse } from "next/server";
import {
  canManageBackups,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { isBackupStorageConfigured } from "@/lib/backups/supabase";
import {
  findRunningRestore,
  getLatestManifest,
  getStorageWarning,
  listBackupItems,
} from "@/lib/backups/storage";
import { isBackupSeason } from "@/lib/backups/season";
import { queryDbFingerprint } from "@/lib/backups/fingerprint";

export async function GET() {
  try {
    const ctx = await requireAdminContext();
    if (!canManageBackups(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    if (!isBackupStorageConfigured()) {
      return NextResponse.json({
        configured: false,
        items: [],
        warning: null,
        seasonActive: isBackupSeason(),
        message:
          "Бэкапы не настроены: добавьте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY, создайте bucket backups.",
      });
    }

    const [items, latest, running, fp] = await Promise.all([
      listBackupItems(),
      getLatestManifest(),
      findRunningRestore(),
      queryDbFingerprint().catch(() => null),
    ]);

    const warning = fp ? await getStorageWarning(fp.dbSize) : null;

    return NextResponse.json({
      configured: true,
      items,
      latest,
      runningRestore: running,
      seasonActive: isBackupSeason(),
      warning,
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка загрузки бэкапов" }, { status: 500 });
  }
}
