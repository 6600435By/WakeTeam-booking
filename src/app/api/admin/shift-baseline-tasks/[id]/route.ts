import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canEditShiftCalendar,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  description: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    if (!canEditShiftCalendar(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.shiftBaselineTask.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const task = await prisma.shiftBaselineTask.update({
      where: { id },
      data: {
        ...(body.description ? { description: body.description.trim() } : {}),
        ...(body.date ? { date: body.date } : {}),
      },
    });
    return NextResponse.json({ task });
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    if (!canEditShiftCalendar(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const { id } = await params;

    const existing = await prisma.shiftBaselineTask.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    await prisma.shiftBaselineTask.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
