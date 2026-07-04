import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSuperAdmin,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  label: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertSuperAdmin(ctx);
    const { id: branchId, itemId } = await params;
    const body = patchSchema.parse(await req.json());

    const item = await prisma.branchShiftChecklistItem.findFirst({
      where: { id: itemId, branchId, organizationId: ctx.organizationId },
    });
    if (!item) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const updated = await prisma.branchShiftChecklistItem.update({
      where: { id: itemId },
      data: body,
    });
    return NextResponse.json({ item: updated });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertSuperAdmin(ctx);
    const { id: branchId, itemId } = await params;

    const item = await prisma.branchShiftChecklistItem.findFirst({
      where: { id: itemId, branchId, organizationId: ctx.organizationId },
    });
    if (!item) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    await prisma.branchShiftChecklistItem.update({
      where: { id: itemId },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
