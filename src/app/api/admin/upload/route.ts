import { NextRequest, NextResponse } from "next/server";
import { assertCatalogAccess, handleAdminError, requireAdminContext } from "@/lib/admin-access";
import { uploadImage } from "@/lib/storage";
import {
  extensionForMime,
  validateImageUpload,
} from "@/lib/upload-image";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    assertCatalogAccess(ctx);
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadImage(buffer, {
      kind,
      ext,
      contentType: file.type,
    });

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
