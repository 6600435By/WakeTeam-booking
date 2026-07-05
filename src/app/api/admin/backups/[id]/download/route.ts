import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canManageBackups,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { createSignedDownloadUrl, readManifest } from "@/lib/backups/storage";

const querySchema = z.object({
  part: z.enum(["db", "files"]),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const ctx = await requireAdminContext();
    if (!canManageBackups(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id } = await context.params;
    const { part } = querySchema.parse({
      part: req.nextUrl.searchParams.get("part"),
    });

    const manifest = await readManifest(id);
    if (!manifest) {
      return NextResponse.json({ error: "Бэкап не найден" }, { status: 404 });
    }

    const objectPath = part === "db" ? manifest.db?.path : manifest.files?.path;
    if (!objectPath) {
      return NextResponse.json(
        { error: part === "db" ? "В этом бэкапе нет базы данных" : "В этом бэкапе нет файлов" },
        { status: 404 },
      );
    }

    const url = await createSignedDownloadUrl(objectPath);
    return NextResponse.json({ url, expiresInSec: 15 * 60 });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Укажите part=db или part=files" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка скачивания" }, { status: 500 });
  }
}
