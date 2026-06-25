import { mkdir, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { randomBytes } from "crypto";
import { handleAdminError, requireAdminContext } from "@/lib/admin-access";
import {
  extensionForMime,
  validateImageUpload,
} from "@/lib/upload-image";

const UPLOAD_SUBDIR = "uploads";

export async function POST(req: NextRequest) {
  try {
    await requireAdminContext();
    const form = await req.formData();
    const file = form.get("file");
    const kind = form.get("kind");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    }
    if (kind !== "branch" && kind !== "staff") {
      return NextResponse.json({ error: "Некорректный тип" }, { status: 400 });
    }

    const validationError = validateImageUpload(file);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const ext = extensionForMime(file.type);
    if (!ext) {
      return NextResponse.json({ error: "Неподдерживаемый формат" }, { status: 400 });
    }

    const dir = path.join(process.cwd(), "public", UPLOAD_SUBDIR, kind);
    await mkdir(dir, { recursive: true });

    const filename = `${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);

    const url = `/${UPLOAD_SUBDIR}/${kind}/${filename}`;
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}
