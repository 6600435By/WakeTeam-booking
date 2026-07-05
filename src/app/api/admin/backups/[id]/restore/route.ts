import { NextResponse } from "next/server";
import { z } from "zod";
import {
  actorFromContext,
  fireAdminActivityFromContext,
} from "@/lib/audit/admin-activity-log";
import {
  canManageBackups,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { formatBackupConfirmDate, formatBackupLabel } from "@/lib/backups/season";
import { triggerRestoreWorkflow } from "@/lib/backups/restore-trigger";
import {
  createRestoreConfirmToken,
  createRestoreId,
  findRunningRestore,
  readManifest,
  writeRestoreStatus,
} from "@/lib/backups/storage";
import type { RestoreStatus } from "@/lib/backups/types";

const bodySchema = z.object({
  restoreDb: z.boolean(),
  restoreFiles: z.boolean(),
  confirmText: z.string().min(1),
  filesBackupId: z.string().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

function isConfirmValid(confirmText: string, backupId: string): boolean {
  const normalized = confirmText.trim().toUpperCase();
  if (normalized === "ВОССТАНОВИТЬ") return true;
  const labelDate = formatBackupConfirmDate(backupId);
  return confirmText.trim() === labelDate;
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const ctx = await requireAdminContext();
    if (!canManageBackups(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id: backupId } = await context.params;
    const body = bodySchema.parse(await req.json());

    if (!body.restoreDb && !body.restoreFiles) {
      return NextResponse.json(
        { error: "Выберите хотя бы один компонент для восстановления" },
        { status: 400 },
      );
    }

    if (!isConfirmValid(body.confirmText, backupId)) {
      return NextResponse.json(
        {
          error: `Введите дату бэкапа (${formatBackupConfirmDate(backupId)}) или слово ВОССТАНОВИТЬ`,
        },
        { status: 400 },
      );
    }

    const running = await findRunningRestore();
    if (running) {
      return NextResponse.json(
        { error: "Уже выполняется восстановление. Дождитесь завершения." },
        { status: 409 },
      );
    }

    const filesBackupId = body.filesBackupId ?? backupId;
    const dbManifest = await readManifest(backupId);
    const filesManifest =
      filesBackupId === backupId ? dbManifest : await readManifest(filesBackupId);

    if (!dbManifest && !filesManifest) {
      return NextResponse.json({ error: "Бэкап не найден" }, { status: 404 });
    }
    if (body.restoreDb && !dbManifest?.db) {
      return NextResponse.json({ error: "В этом бэкапе нет базы данных" }, { status: 400 });
    }
    if (body.restoreFiles && !filesManifest?.files) {
      return NextResponse.json({ error: "В этом бэкапе нет файлов" }, { status: 400 });
    }

    const restoreId = createRestoreId();
    const confirmToken = createRestoreConfirmToken(
      backupId,
      body.restoreDb,
      body.restoreFiles,
      filesBackupId !== backupId ? filesBackupId : undefined,
    );
    const actor = actorFromContext(ctx);

    const initialStatus: RestoreStatus = {
      restoreId,
      backupId,
      status: "running",
      restoreDb: body.restoreDb,
      restoreFiles: body.restoreFiles,
      startedAt: new Date().toISOString(),
      requestedBy: actor.actorName,
      steps: [
        { name: "dispatch", label: "Запуск восстановления", status: "running" },
        { name: "download", label: "Скачивание бэкапа", status: "pending" },
        { name: "db", label: "Восстановление базы данных", status: "pending" },
        { name: "files", label: "Восстановление фото", status: "pending" },
      ],
    };
    await writeRestoreStatus(initialStatus);

    await triggerRestoreWorkflow({
      backupId,
      filesBackupId: filesBackupId !== backupId ? filesBackupId : undefined,
      restoreDb: body.restoreDb,
      restoreFiles: body.restoreFiles,
      confirmToken,
      restoreId,
      requestedBy: actor.actorName,
    });

    fireAdminActivityFromContext(ctx, {
      action: "backup.restore_requested",
      summary: `Запрошено восстановление бэкапа ${formatBackupLabel(backupId)} (БД: ${body.restoreDb ? "да" : "нет"}, фото: ${body.restoreFiles ? "да" : "нет"})`,
    });

    return NextResponse.json({ restoreId });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }
    if (e instanceof Error && e.message === "GITHUB_BACKUP_NOT_CONFIGURED") {
      return NextResponse.json(
        {
          error:
            "Восстановление из админки не настроено: задайте GITHUB_BACKUP_TOKEN и GITHUB_REPO в Vercel.",
        },
        { status: 500 },
      );
    }
    console.error(e);
    return NextResponse.json({ error: "Не удалось запустить восстановление" }, { status: 500 });
  }
}
