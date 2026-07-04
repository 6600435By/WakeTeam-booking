import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSuperAdmin,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  label: z.string().min(1),
});

const reorderSchema = z.object({
  itemIds: z.array(z.string()).min(1),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id: branchId } = await params;
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, organizationId: ctx.organizationId },
    });
    if (!branch) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const items = await prisma.branchShiftChecklistItem.findMany({
      where: { branchId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ items });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertSuperAdmin(ctx);
    const { id: branchId } = await params;
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, organizationId: ctx.organizationId },
    });
    if (!branch) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const body = createSchema.parse(await req.json());
    const count = await prisma.branchShiftChecklistItem.count({ where: { branchId } });
    const item = await prisma.branchShiftChecklistItem.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        label: body.label.trim(),
        sortOrder: count,
      },
    });
    return NextResponse.json({ item });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertSuperAdmin(ctx);
    const { id: branchId } = await params;
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, organizationId: ctx.organizationId },
    });
    if (!branch) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const body = reorderSchema.parse(await req.json());
    const existing = await prisma.branchShiftChecklistItem.findMany({
      where: { branchId, isActive: true },
    });
    const existingIds = new Set(existing.map((i) => i.id));
    if (
      body.itemIds.length !== existing.length ||
      body.itemIds.some((id) => !existingIds.has(id))
    ) {
      return NextResponse.json({ error: "Неверный список пунктов" }, { status: 400 });
    }

    await prisma.$transaction(
      body.itemIds.map((id, sortOrder) =>
        prisma.branchShiftChecklistItem.update({
          where: { id },
          data: { sortOrder },
        }),
      ),
    );

    const items = await prisma.branchShiftChecklistItem.findMany({
      where: { branchId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
